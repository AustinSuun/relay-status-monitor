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
import { Switch } from '@/components/ui/switch';
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
import {
  formatGroupMultiplier,
  getKeyDisplayName,
  getUpstreamDisplayBalance,
  isWalletBalanceKey,
} from '@/lib/key-display';
import { cn } from '@/lib/utils';

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
  name: '厂商',
  monitor: '监控',
  status: '状态',
  groups: '分组概览',
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
            {upstream.enabled ? '关闭监控' : '开启监控'}
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
      header: ({ column }) => <SortableHeader column={column} label="厂商" />,
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={`/upstreams/${row.original.id}`} className="truncate text-base font-semibold hover:underline">
              {row.original.name}
            </Link>
            <Badge variant="outline" className="rounded-md px-2 text-[11px]">{row.original.type}</Badge>
            {!row.original.enabled ? <Badge variant="secondary" className="rounded-md text-[11px]">监控关闭</Badge> : null}
          </div>
          <div className="max-w-72 truncate text-sm text-muted-foreground" title={row.original.baseUrl}>
            {row.original.baseUrl}
          </div>
        </div>
      ),
    },
    {
      id: 'monitor',
      enableSorting: false,
      header: '监控',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.original.enabled}
            aria-label={`${row.original.enabled ? '关闭' : '开启'} ${row.original.name} 监控`}
            onCheckedChange={() => callbacks.onToggle(row.original)}
          />
          <span className="text-xs text-muted-foreground">{row.original.enabled ? '开启' : '关闭'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <SortableHeader column={column} label="状态" />,
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.original.status} />
          <span className="text-xs text-muted-foreground">{row.original.testModel || 'gpt-5.5'}</span>
        </div>
      ),
    },
    {
      id: 'groups',
      header: '分组概览',
      cell: ({ row }) => {
        const enabledKeys = (row.original.keys || []).filter((key) => key.enabled && !isWalletBalanceKey(key));

        return enabledKeys.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无可展示分组</div>
        ) : (
          <div className="flex max-w-[520px] flex-wrap gap-1.5">
            {enabledKeys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
                  'bg-muted/60',
                )}
                title={row.original.type === 'NEW_API' ? getKeyDisplayName(key) : key.group}
              >
                <StatusDot status={key.status} />
                <span className="max-w-32 truncate font-medium">
                  {row.original.type === 'NEW_API' ? getKeyDisplayName(key) : key.group}
                </span>
                {key.groupRateMultiplier != null ? (
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                    {formatGroupMultiplier(key.groupRateMultiplier)}
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
          <div className="text-right">
            <div className="font-mono text-xl font-black tracking-normal text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.22)]">
              {balance == null ? '—' : `$${balance.toFixed(2)}`}
            </div>
            <div className="text-[11px] text-muted-foreground">上游余额</div>
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
