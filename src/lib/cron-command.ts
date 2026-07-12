function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

export function buildCronCommand(origin: string, secret: string): string {
  const normalizedOrigin = origin.trim().replace(/\/+$/, '');
  const endpoint = `${normalizedOrigin}/api/cron/collect`;
  return `* * * * * curl -s -H ${shellQuote(`Authorization: Bearer ${secret}`)} ${shellQuote(endpoint)} > /dev/null`;
}
