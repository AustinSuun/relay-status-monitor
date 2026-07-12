'use client';

import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  ONLINE: { label: '在线', dotClass: 'bg-success', textClass: 'text-success', pulse: true },
  DEGRADED: { label: '降级', dotClass: 'bg-warning', textClass: 'text-warning', pulse: true },
  OFFLINE: { label: '离线', dotClass: 'bg-destructive', textClass: 'text-destructive', pulse: false },
  UNKNOWN: { label: '未知', dotClass: 'bg-muted-foreground', textClass: 'text-muted-foreground', pulse: false },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function StatusDot({
  status,
  size = 'sm',
  decorative = false,
}: {
  status: string;
  size?: 'sm' | 'lg';
  decorative?: boolean;
}) {
  const config = STATUS_CONFIG[status as StatusKey] || STATUS_CONFIG.UNKNOWN;
  const dotSize = size === 'lg' ? 'size-3' : 'size-2';
  return (
    <span className="inline-flex shrink-0 items-center" title={`状态：${config.label}`} aria-hidden={decorative || undefined}>
      <span
        className={cn('inline-block rounded-full', dotSize, config.dotClass, config.pulse && 'pulse-dot')}
      />
      {!decorative && <span className="sr-only">状态：{config.label}</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as StatusKey] || STATUS_CONFIG.UNKNOWN;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <StatusDot status={status} decorative />
      <span className={config.textClass}>{config.label}</span>
    </span>
  );
}
