export interface UpstreamKeyInput {
  group?: string;
  label?: string;
  apiKey?: string;
  accessToken?: string;
  userId?: string;
  testModel?: string;
  enabled?: boolean;
}

export function buildKeyUpdateData(
  input: UpstreamKeyInput,
  encryptValue: (value: string) => string
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (input.group !== undefined) data.group = input.group;
  if (input.label !== undefined) data.label = input.label || null;
  if (input.userId !== undefined) data.userId = input.userId || null;
  if (input.testModel !== undefined) data.testModel = input.testModel || null;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.apiKey !== undefined) data.apiKeyEnc = input.apiKey ? encryptValue(input.apiKey) : null;
  if (input.accessToken !== undefined) {
    data.accessTokenEnc = input.accessToken ? encryptValue(input.accessToken) : null;
  }

  return data;
}
