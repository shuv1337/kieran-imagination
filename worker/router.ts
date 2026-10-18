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
  '/hot': {
    title: 'HOT or NOT? | Coloring Page Rankings',
    description:
      'Vote on AI-generated coloring pages! Rate them HOT or NOT and see which creations rise to the top.',
    image: 'https://kieran.app/hot-share-banner.png',
  },
  '/hotornot': {
    title: 'HOT or NOT? | Coloring Page Rankings',
    description:
      'Vote on AI-generated coloring pages! Rate them HOT or NOT and see which creations rise to the top.',
    image: 'https://kieran.app/hot-share-banner.png',
  },
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

function wilsonScore(upvotes: number, downvotes: number, z = 1.96): number {
  const n = upvotes + downvotes;
  if (n === 0) return 0;
  const p = upvotes / n;
  const zsq = z * z;
  const numerator = p + zsq / (2 * n) - z * Math.sqrt((p * (1 - p) + zsq / (4 * n)) / n);
  const denominator = 1 + zsq / n;
  return numerator / denominator;
}

function calculateHotScore(
  upvotes: number,
  downvotes: number,
  createdAt: number,
  now: number
): number {
  const totalVotes = upvotes + downvotes;
  const wilson = wilsonScore(upvotes, downvotes);
  const hoursOld = Math.max(0, (now - createdAt) / (1000 * 60 * 60));
  const halfLife = 24;
  const timeBoost = 1 / (1 + hoursOld / halfLife);
  const newItemBonus = totalVotes < 3 ? 0.3 * (1 - totalVotes / 3) : 0;
  const engagementBonus = totalVotes > 0 ? Math.log10(1 + totalVotes) * 0.1 : 0;
  const wilsonWeight = Math.min(0.7, 0.3 + totalVotes * 0.04);
  const timeWeight = 1 - wilsonWeight;
  return wilson * wilsonWeight + timeBoost * timeWeight + newItemBonus + engagementBonus;
}

export async function handleHot(request: Request, env: Env): Promise<Response> {
  // Hot or Not requires household login (browsing + voting).
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;

  const ip = getClientIp(request);

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const now = Date.now();

      // Public legacy generated_images only — private media_assets never appear.
      const result = await env.DB.prepare(
        `
        SELECT
          gi.id,
          gi.r2_key,
          gi.prompt,
          gi.created_at,
          COALESCE(SUM(CASE WHEN iv.vote_type = 'hot' THEN 1 ELSE 0 END), 0) as hot_votes,
          COALESCE(SUM(CASE WHEN iv.vote_type = 'not' THEN 1 ELSE 0 END), 0) as not_votes,
          COALESCE(SUM(CASE WHEN iv.vote_type = 'hot' THEN 1 ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN iv.vote_type = 'not' THEN 1 ELSE 0 END), 0) as rating,
          COUNT(iv.id) as total_votes,
          (SELECT vote_type FROM image_votes WHERE image_id = gi.id AND voter_ip = ?) as user_vote
        FROM generated_images gi
        LEFT JOIN image_votes iv ON gi.id = iv.image_id
        GROUP BY gi.id
      `
      )
        .bind(ip)
        .all();

      const allImages = (result.results || []).map((row: any) => {
        const hotScore = calculateHotScore(row.hot_votes, row.not_votes, row.created_at, now);
        return {
          id: row.id,
          url: `/api/images/view?key=${encodeURIComponent(row.r2_key)}`,
          prompt: row.prompt,
          created_at: row.created_at,
          hot_votes: row.hot_votes,
          not_votes: row.not_votes,
          rating: row.rating,
          total_votes: row.total_votes,
          user_vote: row.user_vote,
          hot_score: hotScore,
        };
      });

      const TOP_VOTED_COUNT = 3;
      const FRESH_COUNT = 5;
      const FRESH_MAX_VOTES = 5;
      const FRESH_MAX_AGE_HOURS = 48;

      const byVotes = [...allImages].sort((a, b) => {
        if (b.total_votes !== a.total_votes) return b.total_votes - a.total_votes;
        return b.rating - a.rating;
      });
      const topVoted = byVotes.slice(0, TOP_VOTED_COUNT);
      const topVotedIds = new Set(topVoted.map((img) => img.id));
      const freshCutoff = now - FRESH_MAX_AGE_HOURS * 60 * 60 * 1000;
      const freshImages = allImages
        .filter(
          (img) =>
            !topVotedIds.has(img.id) &&
            img.total_votes < FRESH_MAX_VOTES &&
            img.created_at > freshCutoff
        )
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, FRESH_COUNT);
      const freshIds = new Set(freshImages.map((img) => img.id));
      const remaining = allImages
        .filter((img) => !topVotedIds.has(img.id) && !freshIds.has(img.id))
        .sort((a, b) => b.hot_score - a.hot_score);
      const curatedOrder = [...topVoted, ...freshImages, ...remaining];
      const paginatedImages = curatedOrder.slice(offset, offset + limit);

      return json({
        images: paginatedImages,
        total: curatedOrder.length,
        limit,
        offset,
      });
    } catch (error) {
      console.error(JSON.stringify({ scope: 'hot-list', error: String(error) }));
      return json({ error: 'Failed to fetch images' }, 500);
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json().catch(() => null);
      const { imageId, voteType } = (body || {}) as { imageId?: string; voteType?: string };
      if (!imageId) return json({ error: 'Image ID is required' }, 400);
      if (!voteType || !['hot', 'not'].includes(voteType)) {
        return json({ error: "Vote type must be 'hot' or 'not'" }, 400);
      }

      const image = await env.DB.prepare('SELECT id FROM generated_images WHERE id = ?')
        .bind(imageId)
        .first();
      if (!image) return json({ error: 'Image not found' }, 404);

      const existingVote = await env.DB.prepare(
        'SELECT id, vote_type FROM image_votes WHERE image_id = ? AND voter_ip = ?'
      )
        .bind(imageId, ip)
        .first<{ id: string; vote_type: string }>();

      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          await env.DB.prepare('DELETE FROM image_votes WHERE id = ?').bind(existingVote.id).run();
          return json({ success: true, action: 'removed', message: 'Vote removed' });
        }
        await env.DB.prepare(
          'UPDATE image_votes SET vote_type = ?, created_at = ? WHERE id = ?'
        )
          .bind(voteType, Date.now(), existingVote.id)
          .run();
        return json({
          success: true,
          action: 'changed',
          voteType,
          message: `Changed vote to ${voteType}`,
        });
      }

      const voteId = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO image_votes (id, image_id, vote_type, voter_ip, created_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(voteId, imageId, voteType, ip, Date.now())
        .run();

      return json({ success: true, action: 'added', voteType, message: `Voted ${voteType}!` });
    } catch (error) {
      console.error(JSON.stringify({ scope: 'hot-vote', error: String(error) }));
      return json({ error: 'Failed to submit vote' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}

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
  const response = await routeRequest(request, env, ctx);
  return withGuestCookie(request, response);
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
    if (path === '/api/hot') {
      return handleHot(request, env);
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
