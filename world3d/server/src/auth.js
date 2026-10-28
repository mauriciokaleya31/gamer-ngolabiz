/**
 * Tokens de entrada no mundo, emitidos pelo portal NgolaBiz Gamer (PHP) e
 * verificados aqui. Formato: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * O segredo partilhado vem da variável de ambiente WORLD3D_JOIN_SECRET (nunca no Git).
 *
 * Implementação PHP equivalente: world3d/platform/world3d_bridge.php.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function signToken(payload, secret) {
  if (!secret) throw new Error('segredo em falta');
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = createHmac('sha256', secret).update(body).digest();
  let given;
  try { given = fromB64url(sig); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(body).toString('utf8')); } catch { return null; }
  if (!payload.sub || !payload.exp || payload.exp * 1000 < now) return null;
  if (!['player', 'admin'].includes(payload.role ?? 'player')) return null;
  return payload;
}

/**
 * Resolve a identidade de quem liga.
 *  - token válido do portal → jogador autenticado (sub = "u:<user_id>")
 *  - sem token e convidados permitidos → convidado efémero (só saldo demo)
 */
export function resolveIdentity({ token, secret, allowGuests, guestName }) {
  const p = token ? verifyToken(token, secret) : null;
  if (p) return { playerId: p.sub, displayName: String(p.name ?? 'Jogador').slice(0, 24), role: p.role ?? 'player', isGuest: false };
  if (token && !allowGuests) return null;
  if (!allowGuests) return null;
  const id = `g:${randomBytes(6).toString('hex')}`;
  const name = String(guestName ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 18) || `Visitante-${id.slice(2, 6)}`;
  return { playerId: id, displayName: name, role: 'player', isGuest: true };
}

export function bearer(req) {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
