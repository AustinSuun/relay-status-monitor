export function resolveRuleNumberDraft(draft: string, serverValue: number) {
  const normalized = draft.trim();
  const value = normalized === '' ? Number.NaN : Number(normalized);

  if (!Number.isFinite(value)) {
    return { value: null, draft: String(serverValue) };
  }

  return { value, draft: String(value) };
}
