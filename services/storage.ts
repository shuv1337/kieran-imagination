interface SaveImageResponse {
  url: string;
}

export const saveGeneratedImage = async (dataUrl: string, fileName: string): Promise<string> => {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, fileName }),
  });

  if (!res.ok) {
    throw new Error(`Failed to save image: ${res.status}`);
  }

  const json = (await res.json()) as SaveImageResponse;
  return json.url;
};
