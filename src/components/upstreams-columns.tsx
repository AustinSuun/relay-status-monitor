'use client';

import Link from 'next/link';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Power, Trash2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
    <div className="flex items-center justify-end gap-1">
      {callbacks.onView ? (
        <Button size="icon-sm" variant="ghost" title="查看详情" aria-label={`查看 ${upstream.name} 详情`} onClick={() => callbacks.onView?.(upstream)}>
          <Eye />
        </Button>
      ) : (
        <Button size="icon-sm" variant="ghost" title="查看详情" aria-label={`查看 ${upstream.name} 详情`} asChild>
          <Link href={`/upstreams/${upstream.id}`}>
            <Eye />
          </Link>
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" title="测试" aria-label={`测试 ${upstream.name}`} onClick={() => callbacks.onTest(upstream)}>
        <Zap />
      </Button>
      <Button size="icon-sm" variant="ghost" title="编辑" aria-label={`编辑 ${upstream.name}`} onClick={() => callbacks.onEdit(upstream)}>
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        title={upstream.enabled ? '关闭监控' : '开启监控'}
        aria-label={`${upstream.enabled ? '关闭' : '开启'} ${upstream.name} 监控`}
        onClick={() => callbacks.onToggle(upstream)}
      >
        <Power />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        title="删除"
        aria-label={`删除 ${upstream.name}`}
        onClick={() => callbacks.onDelete(upstream)}
      >
        <Trash2 />
      </Button>
    </div>
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
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/upstreams/${row.original.id}`}
              className={cn(
                'truncate text-lg font-black tracking-normal hover:underline',
                'text-foreground drop-shadow-[0_0_10px_hsl(var(--primary)/0.18)]',
              )}
            >
              {row.original.name}
            </Link>
            <Badge
              variant="outline"
              className="rounded-md border-border/45 bg-muted/35 px-1.5 py-0 text-[10px] font-semibold text-muted-foreground"
            >
              {row.original.type === 'SUB2API' ? 'Sub2API' : 'New API'}
            </Badge>
            {!row.original.enabled ? <Badge variant="secondary" className="rounded-md text-[11px]">监控关闭</Badge> : null}
          </div>
          <div className="max-w-64 truncate text-sm text-muted-foreground" title={row.original.baseUrl}>
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
        const visibleKeys = enabledKeys.slice(0, 3);

        return enabledKeys.length === 0 ? (
          <div className="w-[360px] truncate text-sm text-muted-foreground">暂无可展示分组</div>
        ) : (
          <div className="flex w-[360px] min-w-0 items-center gap-1.5 overflow-hidden">
            {visibleKeys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  'inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
                  'bg-muted/60',
                )}
                title={row.original.type === 'NEW_API' ? getKeyDisplayName(key) : key.group}
              >
                <StatusDot status={key.status} />
                <span className="max-w-28 truncate font-medium">
                  {row.original.type === 'NEW_API' ? getKeyDisplayName(key) : key.group}
                </span>
                {key.groupRateMultiplier != null ? (
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                    {formatGroupMultiplier(key.groupRateMultiplier)}
                  </span>
                ) : null}
              </div>
            ))}
            {enabledKeys.length > 3 ? (
              <span className="shrink-0 rounded-lg bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                +{enabledKeys.length - 3}
              </span>
            ) : null}
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
