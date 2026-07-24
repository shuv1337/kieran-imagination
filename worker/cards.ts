import { CardsRepository } from '../server/cards/repository';
import { WorldsRepository } from '../server/worlds/repository';
import { MediaRepository } from '../server/media/repository';
import type { CardDocumentV1 } from '../shared/cards';
import type { CreationRequest } from '../shared/creation';
import { acceptCreationJob } from './jobs';
import type { Env } from './env';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function handleCreateCard(
  request: Request,
  env: Env,
  ownerId: string,
  worldId: string
): Promise<Response> {
  const worlds = new WorldsRepository(env);
  const world = await worlds.getWorld(worldId, ownerId);
  if (!world) return json({ error: 'World not found' }, 404);

  const body = await request.json().catch(() => ({}));
  const title = typeof (body as any).title === 'string' ? (body as any).title : undefined;
  const document = (body as any).document as CardDocumentV1 | undefined;
  const artworkRevisionId =
    typeof (body as any).artworkRevisionId === 'string' ? (body as any).artworkRevisionId : null;

  const cards = new CardsRepository(env);
  const result = await cards.create(worldId, { title, document, artworkRevisionId });
  return json(result, 201);
}

export async function handleCard(
  request: Request,
  env: Env,
  ownerId: string,
  cardId: string,
  subpath: string[]
): Promise<Response> {
  const cards = new CardsRepository(env);
  const card = await cards.get(cardId);
  if (!card) return json({ error: 'Not found' }, 404);

  const worlds = new WorldsRepository(env);
  const world = await worlds.getWorld(card.worldId, ownerId);
  if (!world) return json({ error: 'Not found' }, 404);

  if (subpath[0] === 'regenerate-art' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const prompt =
      typeof (body as any).prompt === 'string' ? (body as any).prompt : card.title;
    const quality = (body as any).quality === 'premium' ? 'premium' : 'standard';
    const revision = await cards.getCurrentRevision(cardId);
    const art = await worlds.createArtwork(card.worldId, {
      kind: 'card-art',
      title: card.title || 'Card art',
    });
    const creationRequest: CreationRequest = {
      operation: 'card-art.generate',
      quality,
      prompt,
      inputs: [],
      worldId: card.worldId,
      artworkId: art.id,
      targetCardId: cardId,
      expectedCardRevisionId: revision?.id ?? undefined,
    };
    // Stable idempotency: same card revision + prompt → same job
    const idem =
      request.headers.get('Idempotency-Key')?.trim() ||
      `card-art:${cardId}:${revision?.id || 'none'}:${quality}:${prompt.trim().slice(0, 80)}`;
    const res = await acceptCreationJob(env, ownerId, creationRequest, {
      idempotencyKey: idem,
      clientIp: clientIp(request),
    });
    if (!res.ok) return res;
    const data = (await res.json()) as { jobId: string };
    return json(
      { jobId: data.jobId, artworkId: art.id, expectedCardRevisionId: revision?.id },
      202
    );
  }

  if (subpath[0] === 'copy-suggestions' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const revision = await cards.getCurrentRevision(cardId);
    const prompt =
      typeof (body as any).prompt === 'string'
        ? (body as any).prompt
        : `${revision?.document.name || card.title}: fun creature`;
    const creationRequest: CreationRequest = {
      operation: 'card-copy.suggest',
      quality: 'standard',
      prompt,
      inputs: [],
      worldId: card.worldId,
    };
    const idem =
      request.headers.get('Idempotency-Key')?.trim() ||
      `card-copy:${cardId}:${revision?.id || 'none'}:${prompt.trim().slice(0, 80)}`;
    const res = await acceptCreationJob(env, ownerId, creationRequest, {
      idempotencyKey: idem,
      clientIp: clientIp(request),
    });
    if (!res.ok) return res;
    const data = (await res.json()) as { jobId: string };
    return json({ jobId: data.jobId }, 202);
  }

  if (request.method === 'GET') {
    const revision = await cards.getCurrentRevision(cardId);
    let artAssetId: string | null = null;
    let artUrl: string | null = null;
    if (revision?.artworkRevisionId) {
      const artRev = await worlds.getRevision(revision.artworkRevisionId);
      if (artRev) {
        artAssetId = artRev.mediaAssetId;
        artUrl = new MediaRepository(env).assetUrl(artRev.mediaAssetId);
      }
    }
    return json({ card, revision, artAssetId, artUrl });
  }

  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => ({}));
    const expectedRevisionId = (body as any).expectedRevisionId as string;
    const document = (body as any).document as CardDocumentV1;
    if (!expectedRevisionId || !document) {
      return json({ error: 'expectedRevisionId and document are required' }, 400);
    }
    const result = await cards.patchDocument({
      cardId,
      expectedRevisionId,
      document,
      artworkRevisionId: (body as any).artworkRevisionId,
    });
    if ('conflict' in result) {
      return json(
        { error: 'Revision conflict', currentRevisionId: result.currentRevisionId },
        409
      );
    }
    return json(result);
  }

  return json({ error: 'Method not allowed' }, 405);
}

export async function handleListWorldCards(
  env: Env,
  ownerId: string,
  worldId: string
): Promise<Response> {
  const worlds = new WorldsRepository(env);
  const world = await worlds.getWorld(worldId, ownerId);
  if (!world) return json({ error: 'World not found' }, 404);
  const cards = new CardsRepository(env);
  return json({ cards: await cards.listByWorld(worldId) });
}
