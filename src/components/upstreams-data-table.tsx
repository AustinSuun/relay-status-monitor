'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  type PaginationState,
  type SortingState as TanStackSortingState,
  type Updater,
  type VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createUpstreamColumns,
  UPSTREAM_COLUMN_LABELS,
  type UpstreamRow,
} from '@/components/upstreams-columns';
import { getPaginationItems, PAGE_SIZE_OPTIONS } from '@/lib/pagination';
import type { UpstreamSortDirection, UpstreamSortField } from '@/lib/upstream-query';
import { cn } from '@/lib/utils';

export type UpstreamTypeFilter = 'ALL' | 'SUB2API' | 'NEW_API';
export type UpstreamStatusFilter = 'ALL' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';

export interface UpstreamTableQuery {
  search: string;
  type: UpstreamTypeFilter;
  status: UpstreamStatusFilter;
}

export interface UpstreamTablePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UpstreamTableSorting {
  sort?: UpstreamSortField;
  direction: UpstreamSortDirection;
}

export interface UpstreamsDataTableProps {
  data: UpstreamRow[];
  query: UpstreamTableQuery;
  sorting: UpstreamTableSorting;
  pagination: UpstreamTablePagination;
  loading?: boolean;
  onQueryChange: (query: UpstreamTableQuery) => void;
  onSortingChange: (sorting: UpstreamTableSorting) => void;
  onPaginationChange: (pagination: { page: number; pageSize: number }) => void;
  onView?: (upstream: UpstreamRow) => void;
  onTest: (upstream: UpstreamRow) => void;
  onEdit: (upstream: UpstreamRow) => void;
  onToggle: (upstream: UpstreamRow) => void;
  onDelete: (upstream: UpstreamRow) => void;
}

const TYPE_FILTER_OPTIONS: Array<{ value: UpstreamTypeFilter; label: string }> = [
  { value: 'ALL', label: '全部类型' },
  { value: 'SUB2API', label: 'Sub2API' },
  { value: 'NEW_API', label: 'New API' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: UpstreamStatusFilter; label: string }> = [
  { value: 'ALL', label: '全部状态' },
  { value: 'ONLINE', label: '在线' },
  { value: 'DEGRADED', label: '降级' },
  { value: 'OFFLINE', label: '离线' },
  { value: 'UNKNOWN', label: '未知' },
];

const TABLE_SORT_TO_API: Record<string, UpstreamSortField> = {
  name: 'name',
  status: 'status',
  balance: 'totalBalance',
};

const API_SORT_TO_TABLE: Partial<Record<UpstreamSortField, string>> = {
  name: 'name',
  status: 'status',
  totalBalance: 'balance',
};

function resolveUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === 'function'
    ? (updater as (previous: T) => T)(current)
    : updater;
}

export function UpstreamsDataTable({
  data,
  query,
  sorting,
  pagination,
  loading = false,
  onQueryChange,
  onSortingChange,
  onPaginationChange,
  onView,
  onTest,
  onEdit,
  onToggle,
  onDelete,
}: UpstreamsDataTableProps) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const tablePagination = React.useMemo<PaginationState>(
    () => ({
      pageIndex: Math.max(0, pagination.page - 1),
      pageSize: pagination.pageSize,
    }),
    [pagination.page, pagination.pageSize],
  );
  const tableSorting = React.useMemo<TanStackSortingState>(
    () => (sorting.sort
      ? [{ id: API_SORT_TO_TABLE[sorting.sort] || sorting.sort, desc: sorting.direction === 'desc' }]
      : []),
    [sorting.direction, sorting.sort],
  );
  const columns = React.useMemo(
    () => createUpstreamColumns({ onView, onTest, onEdit, onToggle, onDelete }),
    [onView, onTest, onEdit, onToggle, onDelete],
  );

  const resetToFirstPage = React.useCallback(() => {
    if (pagination.page !== 1) {
      onPaginationChange({ page: 1, pageSize: pagination.pageSize });
    }
  }, [onPaginationChange, pagination.page, pagination.pageSize]);

  const handleQueryChange = React.useCallback(
    (nextQuery: UpstreamTableQuery) => {
      onQueryChange(nextQuery);
      resetToFirstPage();
    },
    [onQueryChange, resetToFirstPage],
  );

  const handleSortingChange = React.useCallback(
    (updater: Updater<TanStackSortingState>) => {
      const next = resolveUpdater(updater, tableSorting);
      const first = next[0];
      onSortingChange({
        sort: first ? TABLE_SORT_TO_API[first.id] : undefined,
        direction: first?.desc ? 'desc' : 'asc',
      });
      resetToFirstPage();
    },
    [onSortingChange, resetToFirstPage, tableSorting],
  );

  const handlePaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) => {
      const next = resolveUpdater(updater, tablePagination);
      onPaginationChange({ page: next.pageIndex + 1, pageSize: next.pageSize });
    },
    [onPaginationChange, tablePagination],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    enableMultiSort: false,
    autoResetPageIndex: false,
    pageCount: Math.max(1, pagination.totalPages),
    rowCount: pagination.total,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    state: {
      columnVisibility,
      pagination: tablePagination,
      sorting: tableSorting,
    },
  });

  const visibleColumnCount = Math.max(1, table.getVisibleLeafColumns().length);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          type="search"
          value={query.search}
          placeholder="搜索名称或地址"
          aria-label="搜索上游"
          className="w-full sm:max-w-xs"
          onChange={(event) => handleQueryChange({ ...query, search: event.target.value })}
        />

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            value={query.type}
            onValueChange={(value) => handleQueryChange({
              ...query,
              type: value as UpstreamTypeFilter,
            })}
          >
            <SelectTrigger className="w-full sm:w-36" aria-label="筛选上游类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            value={query.status}
            onValueChange={(value) => handleQueryChange({
              ...query,
              status: value as UpstreamStatusFilter,
            })}
          >
            <SelectTrigger className="w-full sm:w-36" aria-label="筛选上游状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full sm:ml-auto sm:w-auto">
              <SlidersHorizontal data-icon="inline-start" />
              显示列
              <ChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>显示列</DropdownMenuLabel>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {UPSTREAM_COLUMN_LABELS[column.id] || column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table className="min-w-[980px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.id === 'actions' && 'sticky right-0 z-20 border-l bg-background',
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="h-24 text-center text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="group">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.id === 'actions'
                          && 'sticky right-0 z-10 border-l bg-background group-hover:bg-muted/50',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="h-24 text-center text-muted-foreground">
                  暂无匹配的上游
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>共 {pagination.total} 条</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => onPaginationChange({ page: 1, pageSize: Number(value) })}
          >
            <SelectTrigger className="h-8 w-24" aria-label="每页数量">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PAGE_SIZE_OPTIONS.map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize} 条/页
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {pagination.total > 0 ? (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={!table.getCanPreviousPage()}
                  className={!table.getCanPreviousPage() ? 'pointer-events-none opacity-50' : undefined}
                  tabIndex={!table.getCanPreviousPage() ? -1 : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanPreviousPage()) table.previousPage();
                  }}
                />
              </PaginationItem>
              <PaginationItem className="px-2 text-sm text-muted-foreground sm:hidden">
                第 {pagination.page} / {pagination.totalPages} 页
              </PaginationItem>
              {getPaginationItems(pagination.page, pagination.totalPages).map((item, index) => (
                <PaginationItem key={`${item}-${index}`} className="hidden sm:block">
                  {item === 'ellipsis' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={item === pagination.page}
                      onClick={(event) => {
                        event.preventDefault();
                        table.setPageIndex(item - 1);
                      }}
                    >
                      {item}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={!table.getCanNextPage()}
                  className={!table.getCanNextPage() ? 'pointer-events-none opacity-50' : undefined}
                  tabIndex={!table.getCanNextPage() ? -1 : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanNextPage()) table.nextPage();
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    </div>
  );
}
