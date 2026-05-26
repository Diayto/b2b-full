import { getAPIBaseURL, isBackendApiConfigured } from '@/lib/config';
import type { OwnerAssistantContext } from '@/lib/ownerAssistantContext';

export type OwnerAssistantResponse = {
  ok: boolean;
  answer?: string;
  error?: string;
  code?: string;
  model?: string;
};

export function isOwnerAssistantAvailable(): boolean {
  return isBackendApiConfigured();
}

export async function askOwnerAssistant(
  question: string,
  context: OwnerAssistantContext,
  signal?: AbortSignal,
): Promise<OwnerAssistantResponse> {
  const base = getAPIBaseURL();
  const res = await fetch(`${base}/api/ai/owner-assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
    signal,
  });

  const data = (await res.json()) as OwnerAssistantResponse;
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `Запрос не выполнен (HTTP ${res.status})`,
      code: data.code,
    };
  }
  return data;
}
