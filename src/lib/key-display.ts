interface KeyDisplayFields {
  keyName?: string | null;
  label?: string | null;
  group: string;
}

interface KeyGroupFields {
  groupName?: string | null;
  group: string;
}

export function getKeyDisplayName(key: KeyDisplayFields): string {
  return key.keyName || key.label || key.group;
}

export function getKeyGroupLabel(key: KeyGroupFields): string {
  return key.groupName || key.group;
}

export function formatGroupMultiplier(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Number(value.toFixed(4))}x`;
}

export function isWalletBalanceKey(key: {
  group?: string | null;
  label?: string | null;
  keyName?: string | null;
  groupName?: string | null;
}): boolean {
  return [key.group, key.label, key.keyName, key.groupName]
    .some((value) => value?.trim() === '钱包余额');
}

export function getUpstreamDisplayBalance(
  keys: readonly {
    id?: number;
    lastBalance: number | null;
    group?: string | null;
    label?: string | null;
    keyName?: string | null;
    groupName?: string | null;
  }[]
): number | null {
  const walletBalance = keys.find((key) => isWalletBalanceKey(key) && key.lastBalance !== null)?.lastBalance;
  if (walletBalance != null) return walletBalance;
  return keys.find((key) => key.lastBalance !== null)?.lastBalance ?? null;
}

export function getUpstreamDisplayBalanceKey<T extends {
  id: number;
  lastBalance: number | null;
  group?: string | null;
  label?: string | null;
  keyName?: string | null;
  groupName?: string | null;
}>(keys: readonly T[]): T | null {
  return keys.find((key) => isWalletBalanceKey(key) && key.lastBalance !== null)
    ?? keys.find((key) => key.lastBalance !== null)
    ?? null;
}
