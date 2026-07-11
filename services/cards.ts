import type { CardDocument, CardDocumentV1, CardRevision } from '../shared/cards';
import { apiFetch } from './api';

export async function listCards(worldId: string): Promise<{ cards: CardDocument[] }> {
  return apiFetch(`/api/worlds/${worldId}/cards`);
}

export async function createCard(
  worldId: string,
  params: {
    title?: string;
    document?: CardDocumentV1;
    artworkRevisionId?: string | null;
  } = {}
): Promise<{ card: CardDocument; revision: CardRevision }> {
  return apiFetch(`/api/worlds/${worldId}/cards`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getCard(cardId: string): Promise<{
  card: CardDocument;
  revision: CardRevision | null;
  artAssetId?: string | null;
  artUrl?: string | null;
}> {
  return apiFetch(`/api/cards/${cardId}`);
}

export async function regenerateCardArt(
  cardId: string,
  prompt: string,
  idempotencyKey?: string
): Promise<{ jobId: string; artworkId: string }> {
  return apiFetch(`/api/cards/${cardId}/regenerate-art`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey || crypto.randomUUID() },
    body: JSON.stringify({ prompt }),
  });
}

export async function requestCardCopySuggestions(
  cardId: string,
  prompt?: string
): Promise<{ jobId: string }> {
  return apiFetch(`/api/cards/${cardId}/copy-suggestions`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ prompt }),
  });
}

export async function patchCard(
  cardId: string,
  expectedRevisionId: string,
  document: CardDocumentV1,
  artworkRevisionId?: string | null
): Promise<{ card: CardDocument; revision: CardRevision }> {
  return apiFetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    body: JSON.stringify({ expectedRevisionId, document, artworkRevisionId }),
  });
}
