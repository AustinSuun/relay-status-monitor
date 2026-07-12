export type CollectionMetric = { success?: boolean } | null;

export function summarizeCollectionResults(
  results: PromiseSettledResult<CollectionMetric>[]
): { successCount: number; failureCount: number } {
  const successCount = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.success === true
  ).length;
  return { successCount, failureCount: results.length - successCount };
}
