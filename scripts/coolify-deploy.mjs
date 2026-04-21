#!/usr/bin/env node
import '../server/load-env.mjs';

const baseUrl = (process.env.COOLIFY_URL || '').trim().replace(/\/?$/, '');
const token = (process.env.COOLIFY_API_TOKEN || '').trim();
const appId = (process.env.COOLIFY_APPLICATION_ID || '').trim();

if (!baseUrl || !token || !appId) {
  console.error('COOLIFY_URL, COOLIFY_API_TOKEN et COOLIFY_APPLICATION_ID doivent être définies.');
  process.exit(1);
}

const target = `${baseUrl}/api/v1/applications/${appId}/deploy`;

async function trigger() {
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coolify deploy failed (${res.status}): ${text}`);
  }
  const payload = await res.json().catch(() => ({}));
  console.log('[coolify] deploy triggered', payload?.message || 'ok');
}

trigger().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
