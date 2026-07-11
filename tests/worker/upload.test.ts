import { describe, expect, it } from 'vitest';
import { handleUpload } from '../../worker/uploads';
import { MAX_UPLOAD_BYTES } from '../../server/media/normalize';
import { openMigratedDb, mockEnv } from './d1-sqlite';

const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);

/** Minimal File-like for jsdom (no arrayBuffer on Blob). */
function fakeFile(bytes: Uint8Array, name: string, type: string) {
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function uploadRequest(bytes: Uint8Array, name: string, type: string): Request {
  const form = {
    get(key: string) {
      if (key === 'file') return fakeFile(bytes, name, type);
      return null;
    },
  };
  return {
    method: 'POST',
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

describe('handleUpload', () => {
  it('rejects oversize with 413', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    const res = await handleUpload(uploadRequest(big, 'huge.png', 'image/png'), env, 'household');
    expect(res.status).toBe(413);
  });

  it('rejects non-image MIME / magic with 400', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const res = await handleUpload(
      uploadRequest(new TextEncoder().encode('not an image'), 'x.txt', 'text/plain'),
      env,
      'household'
    );
    expect(res.status).toBe(400);
  });

  it('accepts tiny PNG', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const res = await handleUpload(
      uploadRequest(TINY_PNG, 'dot.png', 'image/png'),
      env,
      'household'
    );
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const data = JSON.parse(text) as { assetId: string };
    expect(data.assetId).toBeTruthy();
  });
});
