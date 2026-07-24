import type { Env } from './env';
import { householdOwnerId } from './env';

export const SESSION_COOKIE = 'kieran_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  ownerId: string;
  exp: number;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(env: Env, ownerId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ ownerId, exp })));
  const key = await hmacKey(env.SESSION_SIGNING_KEY);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${payload}.${sig}`;
}

export async function verifySession(env: Env, token: string): Promise<Session | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const key = await hmacKey(env.SESSION_SIGNING_KEY);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(payload)
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Session;
    if (!data.ownerId || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookieHeader(
  token: string,
  opts: { maxAge?: number; secure?: boolean } = {}
): string {
  const maxAge = opts.maxAge ?? SESSION_TTL_SECONDS;
  const secure = opts.secure !== false;
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookieHeader(secure = true): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  // Cloudflare may terminate TLS and set this
  const proto = request.headers.get('x-forwarded-proto');
  return proto === 'https';
}

/** Constant-time string compare for access codes. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Fixed owner id for anonymous (no household login) creation storage. */
export const GUEST_OWNER_ID = 'guest';
const GUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requireSession(
  request: Request,
  env: Env
): Promise<{ ownerId: string } | Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return jsonAuthError(401, 'Login required');
  }
  const session = await verifySession(env, token);
  if (!session) {
    return jsonAuthError(401, 'Session expired. Please log in again.');
  }
  return { ownerId: session.ownerId };
}

/**
 * Owner for creation / worlds / cards / jobs.
 * Logged-in household → shared household storage; otherwise guest.
 */
export async function resolveOwnerId(request: Request, env: Env): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const session = await verifySession(env, token);
    if (session) return session.ownerId;
  }

  const guestId = request.headers.get('x-kieran-guest-id')?.trim() ?? '';
  if (GUEST_ID_PATTERN.test(guestId)) {
    return 'guest:' + guestId.toLowerCase();
  }
  return GUEST_OWNER_ID;
}

function jsonAuthError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  if (env.APP_RATE_LIMITER) {
    const { success } = await env.APP_RATE_LIMITER.limit({ key: `login:${ip}` });
    if (!success) {
      return new Response(JSON.stringify({ error: 'Too many login attempts' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const code = body.code?.trim() ?? '';
  if (!code || !timingSafeEqual(code, env.FAMILY_ACCESS_CODE)) {
    return new Response(JSON.stringify({ error: 'Invalid access code' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ownerId = householdOwnerId(env);
  // Embed a short hash of the access code so rotation of FAMILY_ACCESS_CODE
  // alone is not enough without SESSION_SIGNING_KEY change — document: rotate both.
  const token = await signSession(env, ownerId);
  const secure = isHttpsRequest(request);
  return new Response(JSON.stringify({ ok: true, ownerId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token, { secure }),
    },
  });
}

export async function handleLogout(request?: Request): Promise<Response> {
  const secure = request ? isHttpsRequest(request) : true;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookieHeader(secure),
    },
  });
}

export async function handleSession(request: Request, env: Env): Promise<Response> {
  const secure = isHttpsRequest(request);
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const session = await verifySession(env, token);
  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookieHeader(secure),
      },
    });
  }
  return new Response(JSON.stringify({ authenticated: true, ownerId: session.ownerId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
