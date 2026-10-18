import {
  handleLogin,
  handleLogout,
  handleSession,
  requireSession,
  resolveOwnerId,
  withGuestCookie,
} from './auth';
import {
  handleCancelJob,
  handleCreateJob,
  handleGetJob,
  handleListJobs,
} from './jobs';
import { handleGetAsset, handleUpload } from './uploads';
import { handleArtwork, handleWorlds } from './worlds';
import {
  handleCard,
  handleCreateCard,
  handleListWorldCards,
} from './cards';
import type { Env } from './env';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

const ROUTE_META: Record<string, { title: string; description: string; image: string }> = {
  '/cards': {
    title: "Trading Card Generator | Kieran's Imagination",
    description:
      'Create custom trading cards with AI! Design your own creature cards with different rarities and themes.',
    image: 'https://kieran.app/cards-share-banner.png',
  },
  '/worlds': {
    title: "My Creations | Kieran's Imagination",
    description: 'Persistent worlds of coloring pages and trading cards for the family.',
    image: 'https://kieran.app/og-share-banner.png',
  },
};

async function handleSuggestions(request: Request, env: Env): Promise<Response> {
  const FALLBACK = [
    '🦄 A unicorn in a flower garden',
    '🐙 An octopus playing drums',
    '🏰 A dragon guarding a castle',
    '🚂 A train made of candy',
    '🐱 A cat wizard with a wand',
  ];

  try {
    const ip = getClientIp(request);
    const data = new TextEncoder().encode(ip + '_suggestions_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const ipHash = [...new Uint8Array(hashBuffer)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const results = await env.DB.prepare(
      `SELECT s.id, s.text FROM suggestions s
       WHERE s.serve_count < ?
         AND s.id NOT IN (
           SELECT suggestion_id FROM suggestion_serves WHERE ip_hash = ?
         )
       ORDER BY RANDOM()
       LIMIT ?`
    )
      .bind(10, ipHash, 5)
      .all<{ id: number; text: string }>();

    if (results.results && results.results.length > 0) {
      const suggestions = results.results.map((r) => r.text);
      // Fire-and-forget serve tracking
      for (const row of results.results) {
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO suggestion_serves (suggestion_id, ip_hash) VALUES (?, ?)`
          )
            .bind(row.id, ipHash)
            .run();
          await env.DB.prepare(
            `UPDATE suggestions SET serve_count = serve_count + 1 WHERE id = ?`
          )
            .bind(row.id)
            .run();
        } catch {
          /* ignore */
        }
      }
      return json({ suggestions });
    }
    return json({ suggestions: FALLBACK });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'suggestions', error: String(error) }));
    return json({ suggestions: FALLBACK });
  }
}

async function handleLegacyImageView(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Key parameter is required', { status: 400 });
  if (!key.startsWith('generated/') || key.includes('..')) {
    return new Response('Invalid key format', { status: 400 });
  }
  const object = await env.IMAGES_BUCKET.get(key);
  if (!object) return new Response('Image not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(object.body, { headers });
}

async function injectMeta(env: Env, path: string, origin: string): Promise<Response | null> {
  const meta = ROUTE_META[path];
  if (!meta) return null;

  const indexUrl = new URL('/index.html', origin);
  const response = await env.ASSETS.fetch(indexUrl);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  html = html.replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${meta.description}"`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${meta.title}"`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${meta.description}"`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*"/,
    `<meta property="og:image" content="${meta.image}"`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${meta.title}"`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${meta.description}"`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"/,
    `<meta name="twitter:image" content="${meta.image}"`
  );

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const started = Date.now();
  const response = await routeRequest(request, env, ctx);
  if (shouldLogRequest(request) && typeof ctx?.waitUntil === 'function') {
    ctx.waitUntil(logRequest(request, env, response.status, Date.now() - started));
  }
  return withGuestCookie(request, response);
}

/** Usage signal for the admin dashboard; skips image streaming and job polling noise. */
function shouldLogRequest(request: Request): boolean {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/api/')) return false;
  if (request.method === 'GET' && pathname.startsWith('/api/assets/')) return false;
  if (request.method === 'GET' && /^\/api\/jobs\/[^/]+$/.test(pathname)) return false;
  return true;
}

async function logRequest(
  request: Request,
  env: Env,
  statusCode: number,
  durationMs: number
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO request_logs (id, timestamp, ip_address, endpoint, method, status_code, duration_ms, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        Date.now(),
        getClientIp(request),
        new URL(request.url).pathname,
        request.method,
        statusCode,
        durationMs,
        request.headers.get('user-agent') || 'unknown'
      )
      .run();
  } catch (error) {
    console.error(JSON.stringify({ scope: 'request-log', error: String(error) }));
  }
}

async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // API routes
  if (path.startsWith('/api/')) {
    // Public
    if (path === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env);
    }
    if (path === '/api/logout' && request.method === 'POST') {
      return handleLogout(request);
    }
    if (path === '/api/session' && request.method === 'GET') {
      return handleSession(request, env);
    }
    if (path === '/api/suggestions' && request.method === 'GET') {
      return handleSuggestions(request, env);
    }
    if (path === '/api/images/view' && request.method === 'GET') {
      return handleLegacyImageView(request, env);
    }

    // Creation / worlds / cards: optional household login (guest owner when anonymous)
    if (path === '/api/uploads' && request.method === 'POST') {
      const ownerId = await resolveOwnerId(request, env);
      return handleUpload(request, env, ownerId);
    }

    if (path === '/api/jobs' && request.method === 'POST') {
      const ownerId = await resolveOwnerId(request, env);
      return handleCreateJob(request, env, ownerId);
    }

    if (path === '/api/jobs' && request.method === 'GET') {
      const ownerId = await resolveOwnerId(request, env);
      return handleListJobs(request, env, ownerId);
    }

    const jobMatch = path.match(/^\/api\/jobs\/([^/]+)(\/cancel)?$/);
    if (jobMatch) {
      const ownerId = await resolveOwnerId(request, env);
      const jobId = jobMatch[1];
      if (jobMatch[2] && request.method === 'POST') {
        return handleCancelJob(env, ownerId, jobId);
      }
      if (request.method === 'GET') {
        return handleGetJob(env, ownerId, jobId);
      }
    }

    const assetMatch = path.match(/^\/api\/assets\/([^/]+)$/);
    if (assetMatch && request.method === 'GET') {
      // Guest or household owner for private asset auth
      const ownerId = await resolveOwnerId(request, env);
      return handleGetAsset(request, env, assetMatch[1], ownerId);
    }

    if (path.startsWith('/api/worlds')) {
      const ownerId = await resolveOwnerId(request, env);
      const parts = path.replace(/^\/api\/worlds\/?/, '').split('/').filter(Boolean);

      // /api/worlds/:id/cards
      if (parts.length === 2 && parts[1] === 'cards') {
        if (request.method === 'GET') {
          return handleListWorldCards(env, ownerId, parts[0]);
        }
        if (request.method === 'POST') {
          return handleCreateCard(request, env, ownerId, parts[0]);
        }
      }

      return handleWorlds(request, env, ownerId, parts);
    }

    const artworkMatch = path.match(/^\/api\/artworks\/([^/]+)(?:\/(.*))?$/);
    if (artworkMatch) {
      const ownerId = await resolveOwnerId(request, env);
      const sub = artworkMatch[2] ? artworkMatch[2].split('/').filter(Boolean) : [];
      return handleArtwork(request, env, ownerId, artworkMatch[1], sub);
    }

    const cardMatch = path.match(/^\/api\/cards\/([^/]+)(?:\/(.*))?$/);
    if (cardMatch) {
      const ownerId = await resolveOwnerId(request, env);
      const sub = cardMatch[2] ? cardMatch[2].split('/').filter(Boolean) : [];
      return handleCard(request, env, ownerId, cardMatch[1], sub);
    }

    return json({ error: 'Not found' }, 404);
  }

  // Social meta for special SPA routes
  if (request.method === 'GET' && ROUTE_META[path]) {
    const injected = await injectMeta(env, path, url.origin);
    if (injected) return injected;
  }

  // worlds/* also gets worlds meta when exact /worlds
  if (request.method === 'GET' && path.startsWith('/worlds')) {
    const injected = await injectMeta(env, '/worlds', url.origin);
    if (injected) return injected;
  }

  // Static assets / SPA fallback via ASSETS binding
  return env.ASSETS.fetch(request);
}
