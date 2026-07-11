export interface ImaginationWorld {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Artwork {
  id: string;
  worldId: string;
  kind: 'coloring' | 'card-art' | 'upload' | 'editor';
  title: string;
  currentRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ArtworkRevision {
  id: string;
  artworkId: string;
  parentRevisionId: string | null;
  mediaAssetId: string;
  sourceJobId: string | null;
  prompt: string | null;
  instruction: string | null;
  inputRevisionIds: string[];
  provenance: Record<string, unknown>;
  createdAt: number;
}

export interface WorldCharacter {
  id: string;
  worldId: string;
  name: string;
  pinnedRevisionId: string | null;
  /** Media asset for the pinned revision when resolved. */
  pinnedMediaAssetId?: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateWorldRequest {
  title: string;
  description?: string;
}

export interface CreateArtworkRequest {
  kind: Artwork['kind'];
  title: string;
}

export interface EditorRevisionRequest {
  assetId: string;
  parentRevisionId: string | null;
  title?: string;
}
