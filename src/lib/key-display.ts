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
