export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export type PaginationItem = number | 'ellipsis';

export function parsePaginationParams(searchParams: Pick<URLSearchParams, 'get'>) {
  const rawPage = Number(searchParams.get('page'));
  const rawPageSize = Number(searchParams.get('pageSize'));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? rawPageSize
    : PAGE_SIZE_OPTIONS[0];

  return { page, pageSize };
}

export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(currentPage)), total);
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);

  if (current <= 3) {
    return [1, 2, 3, 4, 'ellipsis', total];
  }
  if (current >= total - 2) {
    return [1, 'ellipsis', total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}
