import type { Artwork, ArtworkRevision, ImaginationWorld, WorldCharacter } from '../shared/worlds';
import { apiFetch } from './api';

export async function listWorlds(): Promise<{ worlds: ImaginationWorld[] }> {
  return apiFetch('/api/worlds');
}

export async function createWorld(title: string, description?: string): Promise<{ world: ImaginationWorld }> {
  return apiFetch('/api/worlds', {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
}

export async function getWorld(worldId: string): Promise<{
  world: ImaginationWorld;
  artworks: Artwork[];
  characters: WorldCharacter[];
}> {
  return apiFetch(`/api/worlds/${worldId}`);
}

export async function patchWorld(
  worldId: string,
  patch: { title?: string; description?: string; archived?: boolean }
): Promise<{ world: ImaginationWorld }> {
  return apiFetch(`/api/worlds/${worldId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function createArtwork(
  worldId: string,
  kind: Artwork['kind'],
  title: string
): Promise<{ artwork: Artwork }> {
  return apiFetch(`/api/worlds/${worldId}/artworks`, {
    method: 'POST',
    body: JSON.stringify({ kind, title }),
  });
}

export async function getArtwork(artworkId: string): Promise<{
  artwork: Artwork;
  revisions: ArtworkRevision[];
}> {
  return apiFetch(`/api/artworks/${artworkId}`);
}

export async function saveEditorRevision(
  artworkId: string,
  assetId: string,
  parentRevisionId: string | null
): Promise<{ revision: ArtworkRevision }> {
  return apiFetch(`/api/artworks/${artworkId}/editor-revisions`, {
    method: 'POST',
    body: JSON.stringify({ assetId, parentRevisionId }),
  });
}

export async function createCharacter(
  worldId: string,
  name: string,
  pinnedRevisionId?: string
): Promise<{ character: WorldCharacter }> {
  return apiFetch(`/api/worlds/${worldId}/characters`, {
    method: 'POST',
    body: JSON.stringify({ name, pinnedRevisionId }),
  });
}

export async function pinCharacter(
  worldId: string,
  characterId: string,
  pinnedRevisionId: string | null
): Promise<{ character: WorldCharacter }> {
  return apiFetch(`/api/worlds/${worldId}/characters/${characterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ pinnedRevisionId }),
  });
}

export async function listCharacters(worldId: string): Promise<{ characters: WorldCharacter[] }> {
  return apiFetch(`/api/worlds/${worldId}/characters`);
}
