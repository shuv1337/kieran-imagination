import { runCreationJob } from './jobs';
import { apiFetch } from './api';

export async function fetchPublicSuggestions(): Promise<string[]> {
  const data = await apiFetch<{ suggestions: string[] }>('/api/suggestions');
  return data.suggestions || [];
}

export async function improvePromptViaJob(prompt: string): Promise<string> {
  const job = await runCreationJob({
    operation: 'prompt.improve',
    quality: 'draft',
    prompt,
    inputs: [],
  });
  if (job.status !== 'succeeded') {
    throw new Error(job.errorMessage || 'Improve failed');
  }
  const result = job.resultJson as { improvedPrompt?: string } | null;
  if (!result?.improvedPrompt) throw new Error('No improved prompt returned');
  return result.improvedPrompt;
}
