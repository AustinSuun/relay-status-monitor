'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Server, Wallet, TrendingUp, Bell, RefreshCw, LayoutDashboard, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/StatusBadge';
import { Sparkline } from '@/components/Sparkline';
import { cn } from '@/lib/utils';
import { formatGroupMultiplier, getKeyDisplayName, getKeyGroupLabel } from '@/lib/key-display';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { beginLatestRequest } from '@/lib/request-sequence';

interface DashboardItem {
  keyId: number;
  upstreamId: number;
  upstreamName: string;
  baseUrl: string;
  type: string;
  group: string;
  label: string | null;
  keyName: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupRateMultiplier: number | null;
  remoteKeyId: string | null;
  hasApiKey: boolean;
  hasAccessToken: boolean;
  status: string;
  balance: number | null;
  latencyMs: number | null;
  testModel: string | null;
  lastCollectedAt: string | null;
  lastError: string | null;
  openIncidents: number;
}

interface DashboardData {
  summary: {
    total: number; online: number; degraded: number; offline: number;
    totalKeys: number; totalBalance: number; availability: number; openIncidents: number;
  };
  items: DashboardItem[];
}

interface DashboardGroup {
  upstreamId: number;
  upstreamName: string;
  baseUrl: string;
  type: string;
  items: DashboardItem[];
  totalBalance: number;
  avgLatencyMs: number | null;
  openIncidents: number;
  knownMultiplierCount: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<Record<number, Record<string, number | null>[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchData = useCallback(async () => {
    const isCurrent = beginLatestRequest(requestSequence);
    setError(null);
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '获取总览失败');
      if (!isCurrent()) return;
      setData(json);
      // 拉取各 key 的趋势
      const trendResults = await Promise.all(
        (json.items as DashboardItem[]).map(async (item) => {
          try {
            const r = await fetch(`/api/metrics?upstreamKeyId=${item.keyId}&hours=6&limit=200`);
            const metrics = await r.json();
            return [item.keyId, metrics.map((m: Record<string, unknown>) => ({ balance: m.balance, latencyMs: m.latencyMs }))] as const;
          } catch { return [item.keyId, []] as const; }
        })
      );
      if (!isCurrent()) return;
      const map: Record<number, Record<string, number | null>[]> = {};
      for (const [id, arr] of trendResults) map[id] = arr;
      setTrends(map);
    } catch (fetchError) {
      if (isCurrent()) setError((fetchError as Error).message || '获取总览失败');
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);

  const pageHeader = (
    <PageHeader
      icon={LayoutDashboard}
      title="总览"
      actions={(
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRefreshing(true); fetchData(); }}
          disabled={refreshing || loading}
        >
          <RefreshCw className={cn(refreshing && 'animate-spin')} data-icon="inline-start" />
          刷新
        </Button>
      )}
    />
  );
  const groupedUpstreams = useMemo(() => groupDashboardItems(data?.items ?? []), [data?.items]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {pageHeader}
        <DashboardSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {pageHeader}
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{error || '总览数据暂时不可用'}</p>
            <Button size="sm" variant="outline" onClick={() => { setLoading(true); fetchData(); }}>
              <RefreshCw data-icon="inline-start" />
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      {pageHeader}

      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="上游/分组" value={`${summary.total}/${summary.totalKeys}`} sub={`${summary.online} 在线 · ${summary.degraded} 降级 · ${summary.offline} 离线`} icon={Server} />
        <StatCard label="总余额" value={`$${summary.totalBalance.toFixed(2)}`} sub="所有分组余额之和" icon={Wallet} />
        <StatCard label="整体可用率" value={`${summary.availability}%`} sub="最近 24 小时" icon={TrendingUp}
          highlight={summary.availability >= 99 ? 'good' : summary.availability >= 95 ? 'warn' : 'bad'} />
        <StatCard label="未解决告警" value={String(summary.openIncidents)} sub={summary.openIncidents > 0 ? '需关注' : '一切正常'} icon={Bell}
          highlight={summary.openIncidents === 0 ? 'good' : 'bad'} />
      </div>

      {/* 分组状态网格 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">分组状态</h2>
        {data.items.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">
            暂无监控数据，去
            <Link href="/upstreams" className="ml-1 text-primary hover:underline">添加上游</Link>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {groupedUpstreams.map((group) => (
              <UpstreamGroupSection key={group.upstreamId} group={group} trends={trends} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent className="flex flex-col gap-3 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-full max-w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub, icon: Icon, highlight }: {
  label: string; value: string; sub: string; icon: React.ComponentType<{ className?: string }>; highlight?: 'good' | 'warn' | 'bad';
}) {
  const color = highlight === 'good' ? 'text-success' : highlight === 'warn' ? 'text-warning' : highlight === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 opacity-60" />
        </div>
        <div className={cn('mt-2 text-2xl font-bold', color)}>{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function UpstreamGroupSection({ group, trends }: { group: DashboardGroup; trends: Record<number, Record<string, number | null>[]> }) {
  return (
    <section className="rounded-xl border bg-card/60 p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold">{group.upstreamName}</span>
            <Badge variant="secondary" className="rounded-md text-[11px]">{group.type === 'SUB2API' ? 'Sub2API' : 'New API'}</Badge>
            {group.openIncidents > 0 ? <Badge variant="destructive" className="rounded-md text-[11px]">{group.openIncidents} 告警</Badge> : null}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground" title={group.baseUrl}>{group.baseUrl}</div>
        </div>
        <div className="grid grid-cols-4 gap-3 text-right text-xs text-muted-foreground">
          <div>
            <div>分组</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">{group.items.length}</div>
          </div>
          <div>
            <div>余额</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">${group.totalBalance.toFixed(2)}</div>
          </div>
          <div>
            <div>均延迟</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">{group.avgLatencyMs != null ? `${group.avgLatencyMs}ms` : '—'}</div>
          </div>
          <div>
            <div>倍率</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">{group.knownMultiplierCount}/{group.items.length}</div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group.items.map((item) => (
          <GroupCard key={item.keyId} item={item} trend={trends[item.keyId] || []} />
        ))}
      </div>
    </section>
  );
}

function GroupCard({ item, trend }: { item: DashboardItem; trend: Record<string, number | null>[] }) {
  const displayName = getKeyDisplayName(item);
  const groupName = getKeyGroupLabel(item);
  const multiplier = getDisplayMultiplier(item);

  return (
    <Link href={`/upstreams/${item.upstreamId}`} className="block">
      <Card className="h-full transition-colors hover:border-foreground/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusDot status={item.status} />
                <span className="truncate font-semibold" title={displayName}>{displayName}</span>
              </div>
              <div className="mt-0.5 min-w-0 text-xs text-muted-foreground">
                <div className="truncate" title={groupName}>分组：{groupName}</div>
                {item.groupDescription ? (
                  <div className="truncate" title={item.groupDescription}>{item.groupDescription}</div>
                ) : null}
              </div>
            </div>
            {item.openIncidents > 0 && (
              <Badge variant="destructive" className="text-xs">{item.openIncidents}</Badge>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">余额</div>
              <div className="font-semibold">{item.balance != null ? `$${item.balance.toFixed(2)}` : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">延迟</div>
              <div className="font-semibold">{item.latencyMs != null ? `${item.latencyMs}ms` : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">倍率</div>
              <div className="font-semibold">{multiplier.value}</div>
              <div className="mt-0.5 text-[10px] leading-none text-muted-foreground">{multiplier.source}</div>
            </div>
          </div>
          <div className="mt-3"><Sparkline data={trend} dataKey="balance" color="hsl(var(--primary))" height={28} /></div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.type === 'SUB2API' ? 'Sub2API' : 'New API'}</span>
            {item.lastCollectedAt && <span>{timeAgo(item.lastCollectedAt)}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function groupDashboardItems(items: DashboardItem[]): DashboardGroup[] {
  const map = new Map<number, DashboardGroup>();

  for (const item of items) {
    const existing = map.get(item.upstreamId);
    if (existing) {
      existing.items.push(item);
      existing.totalBalance += item.balance || 0;
      existing.openIncidents += item.openIncidents;
      if (hasDisplayMultiplier(item)) existing.knownMultiplierCount += 1;
      continue;
    }

    map.set(item.upstreamId, {
      upstreamId: item.upstreamId,
      upstreamName: item.upstreamName,
      baseUrl: item.baseUrl,
      type: item.type,
      items: [item],
      totalBalance: item.balance || 0,
      avgLatencyMs: null,
      openIncidents: item.openIncidents,
      knownMultiplierCount: hasDisplayMultiplier(item) ? 1 : 0,
    });
  }

  return Array.from(map.values()).map((group) => {
    const latencyValues = group.items
      .map((item) => item.latencyMs)
      .filter((value): value is number => value != null);

    return {
      ...group,
      totalBalance: Math.round(group.totalBalance * 100) / 100,
      avgLatencyMs: latencyValues.length
        ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
        : null,
    };
  });
}

function getDisplayMultiplier(item: DashboardItem): { value: string; source: string } {
  if (item.groupRateMultiplier != null) {
    return { value: formatGroupMultiplier(item.groupRateMultiplier), source: '官方同步' };
  }

  const parsed = parseMultiplierFromText([
    item.groupName,
    item.group,
    item.label,
    item.keyName,
    item.groupDescription,
  ]);

  if (parsed) return { value: parsed, source: '名称解析' };
  return { value: '未获取', source: '接口未返回' };
}

function hasDisplayMultiplier(item: DashboardItem): boolean {
  return getDisplayMultiplier(item).value !== '未获取';
}

function parseMultiplierFromText(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const match = value?.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*[xX倍]/);
    if (match) return `${Number(match[1])}x`;
  }
  return null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}
