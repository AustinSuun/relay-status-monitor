import type { KeyMetadataResult } from './adapters/base';

export interface StoredKeyMetadata {
  keyName: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupRateMultiplier: number | null;
  remoteKeyId: string | null;
  metadataError: string | null;
}

export function mergeKeyMetadata(
  existing: StoredKeyMetadata,
  result: KeyMetadataResult
): StoredKeyMetadata {
  if (!result.ok) {
    return {
      ...existing,
      metadataError: result.errorMessage || '远端信息获取失败',
    };
  }

  return {
    keyName: result.keyName ?? existing.keyName,
    groupName: result.groupName ?? existing.groupName,
    groupDescription: result.groupDescription ?? existing.groupDescription,
    groupRateMultiplier: result.groupRateMultiplier ?? existing.groupRateMultiplier,
    remoteKeyId: result.remoteKeyId ?? existing.remoteKeyId,
    metadataError: result.errorMessage || null,
  };
}

export function toSafeUpstreamKey<
  T extends { apiKeyEnc?: string | null; accessTokenEnc?: string | null }
>(key: T) {
  const { apiKeyEnc, accessTokenEnc, ...safe } = key;
  return {
    ...safe,
    hasApiKey: Boolean(apiKeyEnc),
    hasAccessToken: Boolean(accessTokenEnc),
  };
}
