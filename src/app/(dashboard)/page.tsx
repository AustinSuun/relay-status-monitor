'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Server, Wallet, TrendingUp, Bell, RefreshCw, LayoutDashboard, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/StatusBadge';
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
  onlineCount: number;
  degradedCount: number;
  offlineCount: number;
  unknownCount: number;
  usableCount: number;
  availabilityPct: number;
}

type TrendPoint = {
  balance: number | null;
  latencyMs: number | null;
  success: boolean | null;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<Record<number, TrendPoint[]>>({});
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
            return [item.keyId, metrics.map((m: Record<string, unknown>) => ({
              balance: typeof m.balance === 'number' ? m.balance : null,
              latencyMs: typeof m.latencyMs === 'number' ? m.latencyMs : null,
              success: typeof m.success === 'boolean' ? m.success : null,
            }))] as const;
          } catch { return [item.keyId, []] as const; }
        })
      );
      if (!isCurrent()) return;
      const map: Record<number, TrendPoint[]> = {};
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
    <Card className="border-transparent bg-card/70 shadow-sm">
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

function UpstreamGroupSection({ group, trends }: { group: DashboardGroup; trends: Record<number, TrendPoint[]> }) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm ring-1 ring-border/40">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-semibold">{group.upstreamName}</span>
            <Badge variant="secondary" className="border-0 bg-muted px-2 text-[11px]">{group.type === 'SUB2API' ? 'Sub2API' : 'New API'}</Badge>
            {group.openIncidents > 0 ? <Badge variant="destructive" className="rounded-md text-[11px]">{group.openIncidents} 告警</Badge> : null}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground" title={group.baseUrl}>{group.baseUrl}</div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <div className="text-[11px] text-muted-foreground">余额</div>
              <div className={cn(
                'text-3xl font-black tracking-normal text-emerald-500 drop-shadow-[0_0_14px_rgba(16,185,129,0.35)]',
                group.totalBalance <= 0 && 'text-destructive drop-shadow-[0_0_14px_rgba(239,68,68,0.35)]',
              )}>
                ${group.totalBalance.toFixed(2)}
              </div>
            </div>
            {group.items.map((item) => (
              <MultiplierBadge key={item.keyId} item={item} compact />
            ))}
          </div>
        </div>
        <div className="min-w-[280px] flex-1 sm:max-w-[520px]">
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            <MetricPill label="可用" value={`${group.usableCount}/${group.items.length}`} strong={group.availabilityPct >= 80} />
            <MetricPill label="倍率" value={`${group.knownMultiplierCount}/${group.items.length}`} strong={group.knownMultiplierCount === group.items.length} />
            <MetricPill label="均延迟" value={group.avgLatencyMs != null ? `${group.avgLatencyMs}ms` : '—'} />
            <MetricPill label="可用率" value={`${group.availabilityPct}%`} strong={group.availabilityPct >= 80} />
          </div>
          <AvailabilityBar group={group} />
          <div className="mt-2 flex flex-wrap justify-end gap-2 text-[11px] text-muted-foreground">
            <span>在线 {group.onlineCount}</span>
            <span>降级 {group.degradedCount}</span>
            <span>离线 {group.offlineCount}</span>
            {group.unknownCount > 0 ? <span>未知 {group.unknownCount}</span> : null}
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

function MetricPill({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-background/55 px-3 py-2 shadow-inner shadow-black/[0.03]">
      <div>{label}</div>
      <div className={cn('mt-0.5 text-base font-bold', strong ? 'text-success drop-shadow-[0_0_10px_rgba(34,197,94,0.35)]' : 'text-foreground')}>{value}</div>
    </div>
  );
}

function AvailabilityBar({ group }: { group: DashboardGroup }) {
  const total = Math.max(group.items.length, 1);
  const parts = [
    { key: 'online', value: group.onlineCount, className: 'bg-success' },
    { key: 'degraded', value: group.degradedCount, className: 'bg-warning' },
    { key: 'offline', value: group.offlineCount, className: 'bg-destructive' },
    { key: 'unknown', value: group.unknownCount, className: 'bg-muted-foreground/35' },
  ].filter((part) => part.value > 0);

  return (
    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-background/70 shadow-inner">
      {parts.map((part) => (
        <div
          key={part.key}
          className={part.className}
          style={{ width: `${Math.max(4, (part.value / total) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function GroupCard({ item, trend }: { item: DashboardItem; trend: TrendPoint[] }) {
  const displayName = getKeyDisplayName(item);
  const groupName = getKeyGroupLabel(item);

  return (
    <Link href={`/upstreams/${item.upstreamId}`} className="block">
      <Card className={cn(
        'h-full border-transparent bg-background/70 shadow-sm transition hover:-translate-y-0.5 hover:bg-background hover:shadow-md',
        item.openIncidents > 0 && 'ring-1 ring-destructive/30',
      )}>
        <CardContent className="p-5">
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
            <StatusChip status={item.status} incidents={item.openIncidents} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">延迟</div>
              <div className="font-semibold">{item.latencyMs != null ? `${item.latencyMs}ms` : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">倍率</div>
              <MultiplierBadge item={item} />
            </div>
            <div className="sm:col-span-1">
              <div className="text-xs text-muted-foreground">状态</div>
              <div className="font-semibold">{normalizeStatus(item.status) === 'ONLINE' ? '可用' : normalizeStatus(item.status) === 'DEGRADED' ? '降级' : normalizeStatus(item.status) === 'OFFLINE' ? '离线' : '未知'}</div>
            </div>
          </div>
          <div className="mt-5">
            <StatusTimeline trend={trend} currentStatus={item.status} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>近 60 次记录</span>
            {item.lastCollectedAt && <span>{timeAgo(item.lastCollectedAt)}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusChip({ status, incidents }: { status: string; incidents: number }) {
  const normalized = normalizeStatus(status);
  const label = normalized === 'ONLINE' ? '可用' : normalized === 'DEGRADED' ? '降级' : normalized === 'OFFLINE' ? '离线' : '未知';
  const className = normalized === 'ONLINE'
    ? 'border-success/30 bg-success/10 text-success'
    : normalized === 'DEGRADED'
      ? 'border-warning/30 bg-warning/10 text-warning'
      : normalized === 'OFFLINE'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-muted-foreground/20 bg-muted text-muted-foreground';

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Badge variant="outline" className={cn('rounded-md text-[11px]', className)}>{label}</Badge>
      {incidents > 0 ? <Badge variant="destructive" className="rounded-md text-[10px]">{incidents} 告警</Badge> : null}
    </div>
  );
}

function MultiplierBadge({ item, compact = false }: { item: DashboardItem; compact?: boolean }) {
  const multiplier = getDisplayMultiplier(item);
  const isMissing = multiplier.value === '未获取';
  const className = multiplier.source === '官方同步'
    ? 'border-transparent bg-success/10 text-success shadow-[0_0_18px_rgba(34,197,94,0.20)]'
    : multiplier.source === '名称解析'
      ? 'border-transparent bg-cyan-500/10 text-cyan-600 shadow-[0_0_18px_rgba(6,182,212,0.22)] dark:text-cyan-300'
      : 'border-transparent bg-muted text-muted-foreground';
  const label = compact ? `${getKeyDisplayName(item)} ${multiplier.value}` : multiplier.value;

  return (
    <div className="inline-flex min-w-0 flex-col items-start">
      <Badge
        variant="outline"
        className={cn('max-w-full rounded-md px-2 py-1 font-mono text-[12px] font-black', className)}
        title={`${getKeyDisplayName(item)} · ${multiplier.value} · ${multiplier.source}`}
      >
        <span className="truncate">{label}</span>
      </Badge>
      {!compact && (
        <span className={cn('mt-0.5 text-[10px] leading-none', isMissing ? 'text-muted-foreground' : 'text-muted-foreground')}>
          {multiplier.source}
        </span>
      )}
    </div>
  );
}

function StatusTimeline({ trend, currentStatus }: { trend: TrendPoint[]; currentStatus: string }) {
  const normalized = normalizeStatus(currentStatus);
  const recent = trend.slice(-60);
  const missingCount = Math.max(0, 60 - recent.length);
  const points: Array<TrendPoint | null> = [
    ...Array.from({ length: missingCount }, () => null),
    ...recent,
  ];

  if (points.length === 0) {
    return <div className="h-8 rounded-lg bg-muted/50" />;
  }

  return (
    <div>
      <div className="flex h-8 items-end gap-[3px] overflow-hidden rounded-lg bg-muted/35 px-1.5 py-1.5">
        {points.map((point, index) => {
          const state = getTimelineState(point, normalized);
          return (
            <span
              key={index}
              className={cn(
                'h-full min-w-[3px] flex-1 rounded-full',
                state === 'good' && 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]',
                state === 'warn' && 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]',
                state === 'bad' && 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]',
                state === 'empty' && 'bg-muted-foreground/20',
              )}
              title={point ? `延迟 ${point.latencyMs ?? '未知'}ms` : '暂无记录'}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
        <span>Past</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function getTimelineState(point: TrendPoint | null, currentStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'): 'good' | 'warn' | 'bad' | 'empty' {
  if (!point) return 'empty';
  if (point.success === false || currentStatus === 'OFFLINE') return 'bad';
  if (currentStatus === 'DEGRADED' || (point.latencyMs != null && point.latencyMs >= 1500)) return 'warn';
  if (point.success === true) return 'good';
  return 'empty';
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
      if (isOnlineStatus(item.status)) existing.onlineCount += 1;
      if (normalizeStatus(item.status) === 'DEGRADED') existing.degradedCount += 1;
      if (normalizeStatus(item.status) === 'OFFLINE') existing.offlineCount += 1;
      if (normalizeStatus(item.status) === 'UNKNOWN') existing.unknownCount += 1;
      if (isUsableStatus(item.status)) existing.usableCount += 1;
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
      onlineCount: isOnlineStatus(item.status) ? 1 : 0,
      degradedCount: normalizeStatus(item.status) === 'DEGRADED' ? 1 : 0,
      offlineCount: normalizeStatus(item.status) === 'OFFLINE' ? 1 : 0,
      unknownCount: normalizeStatus(item.status) === 'UNKNOWN' ? 1 : 0,
      usableCount: isUsableStatus(item.status) ? 1 : 0,
      availabilityPct: 0,
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
      availabilityPct: Math.round((group.usableCount / Math.max(group.items.length, 1)) * 100),
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

function normalizeStatus(status: string): 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN' {
  const normalized = status.toUpperCase();
  if (normalized === 'ONLINE' || normalized === 'DEGRADED' || normalized === 'OFFLINE') return normalized;
  return 'UNKNOWN';
}

function isOnlineStatus(status: string): boolean {
  return normalizeStatus(status) === 'ONLINE';
}

function isUsableStatus(status: string): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'ONLINE' || normalized === 'DEGRADED';
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
