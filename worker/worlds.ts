import { WorldsRepository } from '../server/worlds/repository';
import { MediaRepository } from '../server/media/repository';
import type { Env } from './env';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleWorlds(
  request: Request,
  env: Env,
  ownerId: string,
  pathParts: string[]
): Promise<Response> {
  // pathParts: after /api/worlds  e.g. [] | [id] | [id, artworks] | [id, characters]
  const repo = new WorldsRepository(env);

  if (pathParts.length === 0) {
    if (request.method === 'GET') {
      const worlds = await repo.listWorlds(ownerId);
      return json({ worlds });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const title = typeof (body as any).title === 'string' ? (body as any).title : 'My World';
      const description =
        typeof (body as any).description === 'string' ? (body as any).description : undefined;
      const world = await repo.createWorld(ownerId, { title, description });
      return json({ world }, 201);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  const worldId = pathParts[0];
  const world = await repo.getWorld(worldId, ownerId);
  if (!world) return json({ error: 'World not found' }, 404);

  if (pathParts.length === 1) {
    if (request.method === 'GET') {
      const artworks = await repo.listArtworks(worldId);
      const characters = await repo.listCharacters(worldId);
      return json({ world, artworks, characters });
    }
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const updated = await repo.patchWorld(worldId, ownerId, body as any);
      return json({ world: updated });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  if (pathParts[1] === 'artworks') {
    if (pathParts.length === 2 && request.method === 'GET') {
      return json({ artworks: await repo.listArtworks(worldId) });
    }
    if (pathParts.length === 2 && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const kind = (body as any).kind || 'coloring';
      const title = (body as any).title || 'Untitled';
      const artwork = await repo.createArtwork(worldId, { kind, title });
      return json({ artwork }, 201);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  if (pathParts[1] === 'characters') {
    if (pathParts.length === 2 && request.method === 'GET') {
      return json({ characters: await repo.listCharacters(worldId) });
    }
    if (pathParts.length === 2 && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const name = typeof (body as any).name === 'string' ? (body as any).name : '';
      if (!name.trim()) return json({ error: 'name is required' }, 400);
      const character = await repo.createCharacter(worldId, {
        name,
        pinnedRevisionId: (body as any).pinnedRevisionId,
        notes: (body as any).notes,
      });
      return json({ character }, 201);
    }
    // PATCH /api/worlds/:id/characters/:characterId
    if (pathParts.length === 3 && request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const character = await repo.pinCharacter(
        pathParts[2],
        worldId,
        (body as any).pinnedRevisionId ?? null
      );
      if (!character) return json({ error: 'Not found' }, 404);
      return json({ character });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  if (pathParts[1] === 'cards' && request.method === 'POST') {
    // Delegated from cards handler usually; keep worlds path for plan API
    return json({ error: 'Use POST body handling in cards module' }, 404);
  }

  return json({ error: 'Not found' }, 404);
}

export async function handleArtwork(
  request: Request,
  env: Env,
  ownerId: string,
  artworkId: string,
  subpath: string[]
): Promise<Response> {
  const repo = new WorldsRepository(env);
  const artwork = await repo.getArtwork(artworkId);
  if (!artwork) return json({ error: 'Not found' }, 404);

  const world = await repo.getWorld(artwork.worldId, ownerId);
  if (!world) return json({ error: 'Not found' }, 404);

  if (subpath[0] === 'editor-revisions' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const assetId = (body as any).assetId as string;
    const parentRevisionId = ((body as any).parentRevisionId as string) || null;
    if (!assetId) return json({ error: 'assetId is required' }, 400);

    const media = new MediaRepository(env);
    const asset = await media.get(assetId);
    if (!asset || asset.ownerId !== ownerId) {
      return json({ error: 'Invalid asset' }, 400);
    }

    const revision = await repo.commitRevision({
      artworkId,
      parentRevisionId,
      mediaAssetId: assetId,
      sourceJobId: null,
      provenance: { source: 'editor' },
    });

    return json({ revision }, 201);
  }

  if (request.method === 'GET') {
    const revisions = await repo.listRevisions(artworkId);
    return json({ artwork, revisions });
  }

  return json({ error: 'Method not allowed' }, 405);
}
