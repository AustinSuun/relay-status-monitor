export function buildSettingsUpdatePayload(
  settings: Record<string, string>,
  includeCronSecret: boolean
): Record<string, string> {
  const payload = { ...settings };
  if (!includeCronSecret) delete payload.cron_secret;
  return payload;
}
