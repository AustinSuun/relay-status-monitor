'use client';

import { useEffect, useState, useCallback, useMemo, useRef, type ComponentType } from 'react';
import Link from 'next/link';
import {
  Server,
  Wallet,
  TrendingUp,
  Bell,
  RefreshCw,
  LayoutDashboard,
  AlertCircle,
  Megaphone,
  Activity,
} from 'lucide-react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { formatGroupMultiplier, getKeyDisplayName } from '@/lib/key-display';
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
  upstreamBalance: number | null;
  upstreamBalanceKeyId: number | null;
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
    total: number;
    online: number;
    degraded: number;
    offline: number;
    totalKeys: number;
    totalBalance: number;
    availability: number;
    openIncidents: number;
  };
  upstreams: DashboardUpstream[];
  items: DashboardItem[];
}

interface DashboardUpstream {
  upstreamId: number;
  upstreamName: string;
  baseUrl: string;
  type: string;
  status: string;
  totalBalance: number;
  balanceKeyId: number | null;
  visibleKeyCount: number;
}

interface DashboardIncident {
  id: number;
  type: string;
  severity: string;
  message: string;
  resolved: boolean;
  createdAt: string;
  upstream?: { id: number; name: string; baseUrl: string } | null;
  upstreamKey?: { id: number; group: string } | null;
}

interface DashboardGroup {
  upstreamId: number;
  upstreamName: string;
  baseUrl: string;
  type: string;
  items: DashboardItem[];
  totalBalance: number;
  balanceKeyId: number | null;
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
  recordedAt: string | null;
};

type BalanceChartPoint = {
  label: string;
  balance: number | null;
  spent: number;
};

type ProviderBalanceSummary = {
  id: number;
  name: string;
  status: string;
  balance: number;
  spentToday: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<Record<number, TrendPoint[]>>({});
  const [incidents, setIncidents] = useState<DashboardIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchData = useCallback(async () => {
    const isCurrent = beginLatestRequest(requestSequence);
    setError(null);
    try {
      const [dashboardRes, incidentRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/incidents?resolved=false&limit=5').catch(() => null),
      ]);
      const json = await dashboardRes.json();
      if (!dashboardRes.ok) throw new Error(json.error || '获取总览失败');

      const incidentJson = incidentRes?.ok ? await incidentRes.json().catch(() => []) : [];
      if (!isCurrent()) return;
      setData(json);
      setIncidents(Array.isArray(incidentJson) ? incidentJson : []);

      const trendKeyIds = Array.from(new Set(
        [
          ...(json.items as DashboardItem[]).flatMap((item) => [item.keyId, item.upstreamBalanceKeyId]),
          ...((json.upstreams || []) as DashboardUpstream[]).map((upstream) => upstream.balanceKeyId),
        ].filter((id): id is number => typeof id === 'number'),
      ));

      const trendResults = await Promise.all(
        trendKeyIds.map(async (keyId) => {
          try {
            const r = await fetch(`/api/metrics?upstreamKeyId=${keyId}&days=7&limit=1000`);
            const metrics = await r.json();
            const points: TrendPoint[] = Array.isArray(metrics) ? metrics.map((m: Record<string, unknown>) => ({
              balance: typeof m.balance === 'number' ? m.balance : null,
              latencyMs: typeof m.latencyMs === 'number' ? m.latencyMs : null,
              success: typeof m.success === 'boolean' ? m.success : null,
              recordedAt: typeof m.recordedAt === 'string' ? m.recordedAt : null,
            })) : [];
            return [keyId, points] as const;
          } catch {
            return [keyId, [] as TrendPoint[]] as const;
          }
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

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

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
  const groupedUpstreams = useMemo(
    () => groupDashboardItems(data?.upstreams ?? [], data?.items ?? []),
    [data?.upstreams, data?.items],
  );

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="上游/分组" value={`${summary.total}/${summary.totalKeys}`} sub={`${summary.online} 在线 · ${summary.degraded} 降级 · ${summary.offline} 离线`} icon={Server} />
        <StatCard label="总余额" value={formatCurrency(summary.totalBalance)} sub="按站点余额去重汇总" icon={Wallet} />
        <StatCard
          label="整体可用率"
          value={`${summary.availability}%`}
          sub="最近 24 小时"
          icon={TrendingUp}
          highlight={summary.availability >= 99 ? 'good' : summary.availability >= 95 ? 'warn' : 'bad'}
        />
        <StatCard
          label="未处理告警"
          value={String(summary.openIncidents)}
          sub={summary.openIncidents > 0 ? '需要关注' : '当前稳定'}
          icon={Bell}
          highlight={summary.openIncidents === 0 ? 'good' : 'bad'}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <BalanceTrendPanel groups={groupedUpstreams} trends={trends} totalBalance={summary.totalBalance} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <AlertFeed incidents={incidents} />
          <AnnouncementPanel />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">分组状态</h2>
        {groupedUpstreams.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              暂无监控数据，去
              <Link href="/upstreams" className="ml-1 text-primary hover:underline">添加上游</Link>
            </CardContent>
          </Card>
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
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </>
  );
}

function StatCard({ label, value, sub, icon: Icon, highlight }: {
  label: string;
  value: string;
  sub: string;
  icon: ComponentType<{ className?: string }>;
  highlight?: 'good' | 'warn' | 'bad';
}) {
  const color = highlight === 'good' ? 'text-success' : highlight === 'warn' ? 'text-warning' : highlight === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <Card className="border-transparent bg-card/70 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 opacity-60" />
        </div>
        <div className={cn('mt-2 text-2xl font-bold tracking-normal', color)}>{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function BalanceTrendPanel({ groups, trends, totalBalance }: {
  groups: DashboardGroup[];
  trends: Record<number, TrendPoint[]>;
  totalBalance: number;
}) {
  const chartData = useMemo(() => buildBalanceTrend(groups, trends), [groups, trends]);
  const providerSummaries = useMemo(() => buildProviderBalanceSummaries(groups, trends), [groups, trends]);
  const availablePoints = chartData.filter((point) => point.balance != null);
  const first = availablePoints[0]?.balance ?? null;
  const last = availablePoints.at(-1)?.balance ?? null;
  const delta = first != null && last != null ? last - first : null;
  const minBalance = availablePoints.length ? Math.min(...availablePoints.map((point) => point.balance ?? 0)) : null;
  const maxBalance = availablePoints.length ? Math.max(...availablePoints.map((point) => point.balance ?? 0)) : null;
  const totalSpentToday = providerSummaries.reduce((sum, item) => sum + item.spentToday, 0);

  return (
    <section className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.36))] p-5 shadow-sm ring-1 ring-border/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Activity className="size-4" />
            余额变化
          </div>
          <div className="mt-2 text-4xl font-black tracking-normal text-emerald-500 drop-shadow-[0_0_18px_rgba(16,185,129,0.28)]">
            {formatCurrency(totalBalance)}
          </div>
        </div>
        <div className="grid min-w-56 grid-cols-4 gap-2 text-right text-xs">
          <TrendMiniStat label="今日消耗" value={formatCurrency(totalSpentToday)} tone={totalSpentToday > 0 ? 'warn' : 'neutral'} />
          <TrendMiniStat label="变化" value={delta == null ? '—' : `${delta >= 0 ? '+' : ''}${formatCurrency(delta)}`} tone={delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'good' : 'bad'} />
          <TrendMiniStat label="最低" value={minBalance == null ? '—' : formatCurrency(minBalance)} />
          <TrendMiniStat label="最高" value={maxBalance == null ? '—' : formatCurrency(maxBalance)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" />余额变化</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" />消耗趋势</span>
        </div>
        <span>最近 7 天</span>
      </div>

      <div className="mt-3 h-52">
        {availablePoints.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-background/40 text-sm text-muted-foreground">
            暂无余额历史
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="dashboardBalanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border" strokeOpacity={0.55} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                yAxisId="balance"
                width={42}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => compactCurrency(Number(value))}
              />
              <YAxis
                yAxisId="spent"
                orientation="right"
                width={42}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => compactCurrency(Number(value))}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
                contentStyle={{
                  fontSize: '12px',
                  borderRadius: '10px',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--popover))',
                }}
                formatter={(value, name) => [
                  typeof value === 'number' ? formatCurrency(value) : '—',
                  name === 'balance' ? '余额' : '消耗',
                ]}
              />
              <Area
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke="rgb(59 130 246)"
                strokeWidth={0}
                fill="url(#dashboardBalanceGradient)"
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke="rgb(59 130 246)"
                strokeWidth={2.75}
                dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Line
                yAxisId="spent"
                type="monotone"
                dataKey="spent"
                stroke="rgb(245 158 11)"
                strokeWidth={2.25}
                dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {providerSummaries.length > 0 ? (
        <div className="mt-4 grid gap-x-5 gap-y-2 border-t border-border/50 pt-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {providerSummaries.map((item) => (
            <ProviderBalanceItem key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TrendMiniStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl bg-background/45 px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn(
        'mt-0.5 font-mono text-sm font-bold',
        tone === 'good' && 'text-emerald-500',
        tone === 'warn' && 'text-amber-500',
        tone === 'bad' && 'text-rose-500',
      )}>
        {value}
      </div>
    </div>
  );
}

function ProviderBalanceItem({ item }: { item: ProviderBalanceSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-background/45 px-3 py-2">
      <span className={cn('size-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor]', getStatusColorClass(item.status))} />
      <span className="min-w-0 flex-1 truncate font-semibold" title={item.name}>
        {item.name}
      </span>
      <span className="shrink-0 font-mono font-bold text-emerald-500">{formatCurrency(item.balance)}</span>
      <span className="shrink-0 text-xs text-muted-foreground">今日</span>
      <span className={cn('shrink-0 font-mono text-sm font-bold', item.spentToday > 0 ? 'text-amber-500' : 'text-muted-foreground')}>
        {formatCurrency(item.spentToday)}
      </span>
    </div>
  );
}

function AlertFeed({ incidents }: { incidents: DashboardIncident[] }) {
  return (
    <section className="rounded-2xl bg-card/75 p-4 shadow-sm ring-1 ring-border/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="size-4 text-amber-500" />
          告警动态
        </div>
        <Badge variant={incidents.length ? 'destructive' : 'secondary'} className="rounded-md">
          {incidents.length ? `${incidents.length} 条` : '正常'}
        </Badge>
      </div>
      {incidents.length === 0 ? (
        <div className="rounded-xl bg-emerald-500/8 px-3 py-5 text-sm text-emerald-600 dark:text-emerald-400">
          当前无未处理告警
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <div key={incident.id} className="rounded-xl bg-background/55 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-xs font-bold', getSeverityClass(incident.severity))}>{getSeverityLabel(incident.severity)}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(incident.createdAt)}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-sm">{incident.message}</div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                {incident.upstream?.name || '未知上游'}{incident.upstreamKey?.group ? ` · ${incident.upstreamKey.group}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AnnouncementPanel() {
  return (
    <section className="rounded-2xl bg-card/75 p-4 shadow-sm ring-1 ring-border/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Megaphone className="size-4 text-cyan-500" />
          上游公告
        </div>
        <Badge variant="outline" className="rounded-md border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
          预留
        </Badge>
      </div>
      <div className="rounded-xl bg-background/55 px-3 py-5 text-sm text-muted-foreground">
        暂无公告
      </div>
    </section>
  );
}

function UpstreamGroupSection({ group, trends }: { group: DashboardGroup; trends: Record<number, TrendPoint[]> }) {
  const displayGroupCount = Math.max(group.items.length, 1);
  const displayUsableCount = group.items.length > 0
    ? group.usableCount
    : group.availabilityPct >= 80 ? 1 : 0;

  return (
    <section className="rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm ring-1 ring-border/40">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-semibold">{group.upstreamName}</span>
            <Badge variant="secondary" className="border-0 bg-muted px-2 text-[11px]">{group.type === 'SUB2API' ? 'Sub2API' : 'New API'}</Badge>
            {group.openIncidents > 0 ? <Badge variant="destructive" className="rounded-md text-[11px]">{group.openIncidents} 告警</Badge> : null}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground" title={group.baseUrl}>{group.baseUrl}</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <InlineMetric label="可用" value={`${displayUsableCount}/${displayGroupCount}`} strong={group.availabilityPct >= 80} />
          <InlineMetric label="倍率" value={`${group.knownMultiplierCount}/${displayGroupCount}`} strong={group.items.length > 0 && group.knownMultiplierCount === group.items.length} />
          <InlineMetric label="均延迟" value={group.avgLatencyMs != null ? `${group.avgLatencyMs}ms` : '—'} />
          <InlineMetric label="可用率" value={`${group.availabilityPct}%`} strong={group.availabilityPct >= 80} />
          <div className="min-w-24 border-l border-border/50 pl-4 text-right">
            <div className="text-[11px] text-muted-foreground">余额</div>
            <div className={cn(
              'text-3xl font-black leading-none tracking-normal text-emerald-500 drop-shadow-[0_0_14px_rgba(16,185,129,0.35)]',
              group.totalBalance <= 0 && 'text-destructive drop-shadow-[0_0_14px_rgba(239,68,68,0.35)]',
            )}>
              {formatCurrency(group.totalBalance)}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group.items.length > 0 ? (
          group.items.map((item) => (
            <GroupCard key={item.keyId} item={item} trend={trends[item.keyId] || []} />
          ))
        ) : (
          <div className="rounded-xl bg-background/55 px-4 py-5 text-sm text-muted-foreground">
            暂无可展示分组，仅展示厂商余额和状态。
          </div>
        )}
      </div>
    </section>
  );
}

function InlineMetric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-14 text-right">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-base font-black leading-none', strong ? 'text-success drop-shadow-[0_0_10px_rgba(34,197,94,0.35)]' : 'text-foreground')}>{value}</div>
    </div>
  );
}

function GroupCard({ item, trend }: { item: DashboardItem; trend: TrendPoint[] }) {
  const displayName = getKeyDisplayName(item);

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

function MultiplierBadge({ item }: { item: DashboardItem }) {
  const multiplier = getDisplayMultiplier(item);
  const isKnown = multiplier !== '未获取';

  return (
    <div className="inline-flex min-w-0 flex-col items-start">
      <Badge
        variant="outline"
        className={cn(
          'max-w-full rounded-md border-transparent px-2 py-1 font-mono text-[12px] font-black',
          isKnown
            ? 'bg-cyan-500/10 text-cyan-600 shadow-[0_0_18px_rgba(6,182,212,0.22)] dark:text-cyan-300'
            : 'bg-muted text-muted-foreground',
        )}
        title={multiplier}
      >
        <span className="truncate">{multiplier}</span>
      </Badge>
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

function groupDashboardItems(upstreams: DashboardUpstream[], items: DashboardItem[]): DashboardGroup[] {
  const map = new Map<number, DashboardGroup>();

  for (const upstream of upstreams) {
    map.set(upstream.upstreamId, {
      upstreamId: upstream.upstreamId,
      upstreamName: upstream.upstreamName,
      baseUrl: upstream.baseUrl,
      type: upstream.type,
      items: [],
      totalBalance: upstream.totalBalance,
      balanceKeyId: upstream.balanceKeyId,
      avgLatencyMs: null,
      openIncidents: 0,
      knownMultiplierCount: 0,
      onlineCount: 0,
      degradedCount: 0,
      offlineCount: 0,
      unknownCount: 0,
      usableCount: 0,
      availabilityPct: isUsableStatus(upstream.status) ? 100 : 0,
    });
  }

  for (const item of items) {
    const existing = map.get(item.upstreamId);
    if (!existing) continue;

    existing.items.push(item);
    if (existing.totalBalance <= 0 && item.upstreamBalance != null) existing.totalBalance = item.upstreamBalance;
    if (existing.balanceKeyId == null && item.upstreamBalanceKeyId != null) existing.balanceKeyId = item.upstreamBalanceKeyId;
    existing.openIncidents += item.openIncidents;
    if (hasDisplayMultiplier(item)) existing.knownMultiplierCount += 1;
    if (isOnlineStatus(item.status)) existing.onlineCount += 1;
    if (normalizeStatus(item.status) === 'DEGRADED') existing.degradedCount += 1;
    if (normalizeStatus(item.status) === 'OFFLINE') existing.offlineCount += 1;
    if (normalizeStatus(item.status) === 'UNKNOWN') existing.unknownCount += 1;
    if (isUsableStatus(item.status)) existing.usableCount += 1;
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
      availabilityPct: group.items.length > 0
        ? Math.round((group.usableCount / group.items.length) * 100)
        : group.availabilityPct,
    };
  });
}

function getDisplayMultiplier(item: DashboardItem): string {
  if (item.groupRateMultiplier != null) return formatGroupMultiplier(item.groupRateMultiplier);

  const parsed = parseMultiplierFromText([
    item.groupName,
    item.group,
    item.label,
    item.keyName,
    item.groupDescription,
  ]);

  return parsed || '未获取';
}

function hasDisplayMultiplier(item: DashboardItem): boolean {
  return getDisplayMultiplier(item) !== '未获取';
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

function buildBalanceTrend(groups: DashboardGroup[], trends: Record<number, TrendPoint[]>): BalanceChartPoint[] {
  const buckets = buildRecentDateBuckets(7);
  const series = groups.map((group) => getGroupBalanceSeries(group, trends));

  return buckets.map((bucket, index) => {
    const nextStart = buckets[index + 1]?.start ?? new Date();
    let balanceTotal = 0;
    let balanceCount = 0;
    let spentTotal = 0;

    for (const points of series) {
      const lastPoint = findLastBalanceBefore(points, nextStart);
      if (lastPoint?.balance != null) {
        balanceTotal += lastPoint.balance;
        balanceCount += 1;
      }
      spentTotal += calculateSpentBetween(points, bucket.start, nextStart);
    }

    return {
      label: bucket.label,
      balance: balanceCount > 0 ? roundMoney(balanceTotal) : null,
      spent: roundMoney(spentTotal),
    };
  });
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function compactCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 100) return `$${value.toFixed(0)}`;
  if (Math.abs(value) >= 10) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(0)}`;
}

function buildProviderBalanceSummaries(groups: DashboardGroup[], trends: Record<number, TrendPoint[]>): ProviderBalanceSummary[] {
  const todayStart = startOfDay(new Date());
  return groups.map((group) => {
    const points = getGroupBalanceSeries(group, trends);
    return {
      id: group.upstreamId,
      name: group.upstreamName,
      status: group.availabilityPct >= 80 ? 'ONLINE' : group.usableCount > 0 ? 'DEGRADED' : 'OFFLINE',
      balance: group.totalBalance,
      spentToday: roundMoney(calculateSpentBetween(points, todayStart, new Date())),
    };
  });
}

function getGroupBalanceSeries(group: DashboardGroup, trends: Record<number, TrendPoint[]>): Array<{ balance: number; recordedAt: Date }> {
  const balanceKeyId = group.balanceKeyId ?? group.items[0]?.keyId;
  if (!balanceKeyId) return [];

  return (trends[balanceKeyId] || [])
    .filter((point): point is TrendPoint & { balance: number; recordedAt: string } => (
      point.balance != null && typeof point.recordedAt === 'string'
    ))
    .map((point) => ({ balance: point.balance, recordedAt: new Date(point.recordedAt) }))
    .filter((point) => Number.isFinite(point.recordedAt.getTime()))
    .sort((left, right) => left.recordedAt.getTime() - right.recordedAt.getTime());
}

function buildRecentDateBuckets(days: number): Array<{ start: Date; label: string }> {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) => {
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1 - index));
    return {
      start,
      label: `${start.getMonth() + 1}月${start.getDate()}日`,
    };
  });
}

function findLastBalanceBefore(points: Array<{ balance: number; recordedAt: Date }>, before: Date): { balance: number; recordedAt: Date } | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].recordedAt < before) return points[index];
  }
  return null;
}

function calculateSpentBetween(points: Array<{ balance: number; recordedAt: Date }>, start: Date, end: Date): number {
  let previous: number | null = null;
  let spent = 0;

  for (const point of points) {
    if (point.recordedAt < start) {
      previous = point.balance;
      continue;
    }
    if (point.recordedAt >= end) break;
    if (previous != null && point.balance < previous) {
      spent += previous - point.balance;
    }
    previous = point.balance;
  }

  return spent;
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}

function getSeverityLabel(severity: string): string {
  if (severity === 'CRITICAL') return '严重';
  if (severity === 'WARNING') return '警告';
  return '提示';
}

function getSeverityClass(severity: string): string {
  if (severity === 'CRITICAL') return 'text-rose-500';
  if (severity === 'WARNING') return 'text-amber-500';
  return 'text-cyan-500';
}

function getStatusColorClass(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === 'ONLINE') return 'bg-emerald-500 text-emerald-500';
  if (normalized === 'DEGRADED') return 'bg-amber-500 text-amber-500';
  if (normalized === 'OFFLINE') return 'bg-rose-500 text-rose-500';
  return 'bg-muted-foreground text-muted-foreground';
}
