import fs from 'node:fs';
import path from 'node:path';

const baseUrl = String(process.env.ATTESTATIONS_IMPORT_URL || 'https://laforge-hub.com').replace(/\/$/, '');
const token = String(process.env.ATTESTATIONS_IMPORT_TOKEN || '');
if (!token) throw new Error('ATTESTATIONS_IMPORT_TOKEN manquant');

async function request(body) {
  const response = await fetch(`${baseUrl}/api/admin/attestations/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Attestations-Import-Token': token,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${payload.error || 'échec import'}`);
  return payload;
}

function filesFor(kind, folder) {
  const root = path.resolve('data/attestations', folder);
  const pdfDir = path.join(root, 'pdf');
  const previewDir = path.join(root, 'preview');
  return fs.readdirSync(pdfDir).filter((name) => name.toLowerCase().endsWith('.pdf')).map((fileName) => {
    const tableNumber = fileName.match(/^NOAI_26_\d{3}/)?.[0];
    if (!tableNumber) throw new Error(`Numéro de table absent du fichier ${fileName}`);
    const previewName = fs.readdirSync(previewDir).find(
      (name) => name.startsWith(tableNumber) && /\.jpe?g$/i.test(name),
    );
    if (!previewName) throw new Error(`Aperçu absent pour ${tableNumber}`);
    return {
      action: 'file',
      tableNumber,
      kind,
      fileName,
      pdf: fs.readFileSync(path.join(pdfDir, fileName)).toString('base64'),
      previewImage: fs.readFileSync(path.join(previewDir, previewName)).toString('base64'),
    };
  });
}

const seed = await request({ action: 'seed' });
console.log(`[upload] liste prête : ${seed.participants} participants, ${seed.certificates} attestations`);

const files = [...filesFor('NOAI', 'noai'), ...filesFor('BOOTCAMP', 'bootcamp')];
for (let index = 0; index < files.length; index += 1) {
  await request(files[index]);
  if ((index + 1) % 10 === 0 || index + 1 === files.length) {
    console.log(`[upload] ${index + 1}/${files.length} fichiers importés`);
  }
}

const status = await request({ action: 'status' });
console.log(`[upload] terminé : ${status.participants} participants, ${status.ready}/${status.certificates} attestations prêtes`);
