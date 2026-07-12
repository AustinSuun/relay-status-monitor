'use client';

import Link from 'next/link';
import type { Column, ColumnDef } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge, StatusDot } from '@/components/StatusBadge';
import { formatGroupMultiplier, getKeyDisplayName, getKeyGroupLabel, getUpstreamDisplayBalance, isWalletBalanceKey } from '@/lib/key-display';

export interface UpstreamKeyRow {
  id: number;
  group: string;
  label: string | null;
  userId?: string | null;
  keyName: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupRateMultiplier: number | null;
  remoteKeyId?: string | null;
  metadataSyncedAt?: string | null;
  metadataError?: string | null;
  status: string;
  lastBalance: number | null;
  lastLatencyMs: number | null;
  hasApiKey: boolean;
  hasAccessToken: boolean;
  enabled: boolean;
}

export interface UpstreamRow {
  id: number;
  name: string;
  baseUrl: string;
  type: string;
  status: string;
  enabled: boolean;
  priority: number;
  testModel: string | null;
  totalBalance?: number | null;
  keys?: UpstreamKeyRow[];
}

export interface UpstreamColumnCallbacks {
  onView?: (upstream: UpstreamRow) => void;
  onTest: (upstream: UpstreamRow) => void;
  onEdit: (upstream: UpstreamRow) => void;
  onToggle: (upstream: UpstreamRow) => void;
  onDelete: (upstream: UpstreamRow) => void;
}

export const UPSTREAM_COLUMN_LABELS: Record<string, string> = {
  name: '名称',
  baseUrl: '地址',
  type: '类型',
  status: '状态',
  groups: '密钥信息',
  balance: '余额',
};

export function getUpstreamTotalBalance(upstream: UpstreamRow): number | null {
  if (upstream.totalBalance != null) return upstream.totalBalance;
  return getUpstreamDisplayBalance(upstream.keys || []);
}

function SortableHeader({
  column,
  label,
}: {
  column: Column<UpstreamRow, unknown>;
  label: string;
}) {
  const direction = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`按${label}排序`}
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {direction === 'asc' ? (
        <ArrowUp data-icon="inline-end" />
      ) : direction === 'desc' ? (
        <ArrowDown data-icon="inline-end" />
      ) : (
        <ArrowUpDown data-icon="inline-end" />
      )}
    </Button>
  );
}

function RowActions({
  upstream,
  callbacks,
}: {
  upstream: UpstreamRow;
  callbacks: UpstreamColumnCallbacks;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`打开 ${upstream.name} 的操作菜单`}
          title={`打开 ${upstream.name} 的操作菜单`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>操作</DropdownMenuLabel>
          {callbacks.onView ? (
            <DropdownMenuItem onSelect={() => callbacks.onView?.(upstream)}>
              <Eye />
              查看详情
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={`/upstreams/${upstream.id}`}>
                <Eye />
                查看详情
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => callbacks.onTest(upstream)}>
            <Zap />
            测试
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => callbacks.onEdit(upstream)}>
            <Pencil />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => callbacks.onToggle(upstream)}>
            <Power />
            {upstream.enabled ? '禁用' : '启用'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => callbacks.onDelete(upstream)}
          >
            <Trash2 />
            删除
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function createUpstreamColumns(
  callbacks: UpstreamColumnCallbacks,
): ColumnDef<UpstreamRow>[] {
  return [
    {
      accessorKey: 'name',
      enableHiding: false,
      header: ({ column }) => <SortableHeader column={column} label="名称" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/upstreams/${row.original.id}`} className="truncate font-medium hover:underline">
            {row.original.name}
          </Link>
          {!row.original.enabled ? <Badge variant="secondary">已禁用</Badge> : null}
        </div>
      ),
    },
    {
      accessorKey: 'baseUrl',
      header: '地址',
      cell: ({ row }) => (
        <div className="max-w-60 truncate text-sm text-muted-foreground" title={row.original.baseUrl}>
          {row.original.baseUrl}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <SortableHeader column={column} label="状态" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'groups',
      header: '密钥信息',
      cell: ({ row }) => {
        const enabledKeys = (row.original.keys || []).filter((key) => key.enabled && !isWalletBalanceKey(key));

        return enabledKeys.length === 0 ? (
          <span className="text-xs text-muted-foreground">无</span>
        ) : (
          <div className="flex flex-col gap-2">
            {enabledKeys.map((key) => (
              <div key={key.id} className="flex min-w-0 flex-col gap-0.5 text-xs">
                <div className="flex items-center gap-1">
                  <StatusDot status={key.status} />
                  <span className="truncate" title={row.original.type === 'NEW_API' ? getKeyDisplayName(key) : key.group}>
                    {row.original.type === 'NEW_API' ? getKeyDisplayName(key) : key.group}
                  </span>
                </div>
                {row.original.type === 'NEW_API' ? (
                  <span className="max-w-80 break-words pl-3 text-muted-foreground">
                    分组：{getKeyGroupLabel(key)} · 说明：{key.groupDescription || '—'} · 倍率：{formatGroupMultiplier(key.groupRateMultiplier)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      id: 'balance',
      accessorFn: getUpstreamTotalBalance,
      header: ({ column }) => <SortableHeader column={column} label="余额" />,
      cell: ({ row }) => {
        const balance = getUpstreamTotalBalance(row.original);
        return (
          <div className="text-right font-mono text-sm">
            {balance == null ? '—' : `$${balance.toFixed(2)}`}
          </div>
        );
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions upstream={row.original} callbacks={callbacks} />
        </div>
      ),
    },
  ];
}
