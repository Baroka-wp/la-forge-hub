import jwt from 'jsonwebtoken';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET manquant');
  return s;
}

export function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '30d', algorithm: 'HS256' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}
