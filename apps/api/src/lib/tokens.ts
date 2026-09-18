import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token de sessão opaco: 256 bits aleatórios. Somente o SHA-256 é persistido. */
export function generateSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token CSRF vinculado à sessão: HMAC(segredo do servidor, id da sessão). Sem estado extra no banco. */
export function csrfTokenFor(secret: string, sessionId: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Identificador estável e não reversível para usar em chaves de rate limit e auditoria (sem guardar o e-mail). */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 32);
}
