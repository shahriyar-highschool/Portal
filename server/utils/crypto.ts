import type { UserRole } from '../../shared/types';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

export function generateId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const hex = bytesToHex(bytes);
  return prefix ? `${prefix}_${hex}` : hex;
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPassword(password: string, existingSaltHex?: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = existingSaltHex
    ? hexToBytes(existingSaltHex)
    : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(saltBytes);

  const encoder = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: saltHex,
  };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  if (hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

export interface SignedSessionPayload {
  userId: string;
  role: UserRole;
  username?: string;
  fullName?: string;
  remoteToken?: string;
  exp: number;
}

const DEFAULT_SIGNING_SECRET = 'shahriar-school-stateless-session-v1';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret?: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret || DEFAULT_SIGNING_SECRET);
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSignedSessionToken(
  payload: SignedSessionPayload,
  secret?: string
): Promise<string> {
  const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
  const bodyB64 = toBase64Url(bodyBytes);
  const key = await importHmacKey(secret);
  const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyB64));
  const sigB64 = toBase64Url(new Uint8Array(sigBuf));
  return `st1.${bodyB64}.${sigB64}`;
}

export async function verifySignedSessionToken(
  token: string,
  secret?: string
): Promise<SignedSessionPayload | null> {
  if (!token.startsWith('st1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, bodyB64, sigB64] = parts;
  const sigBytes = fromBase64Url(sigB64);
  const bodyBytes = fromBase64Url(bodyB64);
  if (!sigBytes || !bodyBytes) return null;

  try {
    const key = await importHmacKey(secret);
    const valid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(bodyB64)
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(bodyBytes)) as SignedSessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
