export const SESSION_COOKIE = 'liveit_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret, usages) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

export async function createSessionToken(secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('LIVEIT_SESSION_SECRET must be at least 32 characters.');
  }
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const payload = `${expires}.${toBase64Url(nonce)}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret, ['sign']), encoder.encode(payload));
  return `${toBase64Url(encoder.encode(payload))}.${toBase64Url(new Uint8Array(signature))}`;
}

export function cookieValue(cookieHeader, name = SESSION_COOKIE) {
  const prefix = `${name}=`;
  const entry = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

export async function hasValidSession(cookieHeader, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const token = cookieValue(cookieHeader);
  const [encodedPayload, encodedSignature, ...extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra.length) return false;

  try {
    const payload = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const [expiresText, nonce, ...parts] = payload.split('.');
    const expires = Number(expiresText);
    if (!Number.isSafeInteger(expires) || expires <= Math.floor(now / 1000) || !nonce || parts.length) return false;
    return await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret, ['verify']),
      fromBase64Url(encodedSignature),
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}
