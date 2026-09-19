// Specification only: no supplier SDK is implemented in this file.
export type ModelError = 'AUTH' | 'CONFIG' | 'INPUT_INVALID' | 'CONTENT_REJECTED'
  | 'RATE_LIMIT' | 'TIMEOUT_UNKNOWN' | 'TRANSIENT' | 'CANCELLED'
  | 'CONSENT_REVOKED' | 'OUTPUT_INVALID';
export interface Fact { id: string; version: number; body: string }
export interface TextInput {
  runId: string; attempt: number; fencingToken: number;
  model: string; promptVersion: string; systemPrompt: string;
  profile: { displayName: string; callMe: string };
  confirmedFacts: Fact[]; memoryRevision: number; conversationEpoch: number;
  messages: { role: 'user' | 'assistant'; text: string }[];
  maxOutputTokens: number; signal: AbortSignal;
}
export type TextEvent =
  | { type: 'started'; providerRequestId: string; modelVersion: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedTokens: number }
  | { type: 'completed'; finishReason: 'stop' | 'length' }
  | { type: 'failed'; code: ModelError; retryAfterMs?: number };
export interface TextAdapter { stream(input: TextInput): AsyncIterable<TextEvent> }
export interface MediaInput {
  taskId: string; attempt: number; submitKey: string; fencingToken: number;
  kind: 'enhance'; assetIds: string[]; consentId: string; inputRevision: number;
  requiredIndices: number[]; minimumLongEdge: number;
}
export interface MediaResult {
  providerTaskId: string; state: 'processing' | 'succeeded' | 'failed' | 'unknown';
  outputs: { index: number; retrievalReference: string; mimeType: string }[];
  error?: ModelError;
}
export interface MediaAdapter {
  submit(input: MediaInput): Promise<MediaResult>;
  query(providerTaskId: string): Promise<MediaResult>;
  cancelSupported: boolean; deleteSupported: boolean;
}
