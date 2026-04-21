const rawKeys = (process.env.AUTOMATION_API_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);
const KEY_SET = new Set(rawKeys);

function normalizeHeaderValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]).trim() : '';
  }
  return String(value).trim();
}

function buildAutomationUser(key) {
  const suffix = key.slice(-6);
  return {
    id: `automation:${suffix || 'bot'}`,
    email: 'automation@laforgehub.local',
    displayName: 'Automation Bot',
    role: 'admin',
    automationKey: key,
  };
}

export function automationUserFromRequest(req) {
  if (!KEY_SET.size) return null;
  const headerKey = normalizeHeaderValue(req.headers['x-automation-key']) || normalizeHeaderValue(req.headers['x-api-key']);
  if (headerKey && KEY_SET.has(headerKey)) {
    return buildAutomationUser(headerKey);
  }
  const auth = normalizeHeaderValue(req.headers.authorization);
  if (auth && auth.startsWith('Automation ')) {
    const key = auth.slice('Automation '.length).trim();
    if (key && KEY_SET.has(key)) {
      return buildAutomationUser(key);
    }
  }
  return null;
}

export function requireAutomation(req) {
  const user = automationUserFromRequest(req);
  if (!user) {
    return { error: 'Clé automation invalide ou absente', status: 401 };
  }
  return { user };
}
