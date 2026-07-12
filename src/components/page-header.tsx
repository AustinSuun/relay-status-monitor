import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  actionsClassName?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  leading,
  meta,
  actions,
  actionsClassName,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 max-w-full items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {leading}
            <h1 className="min-w-0 break-words text-xl font-bold md:text-2xl">{title}</h1>
            {meta}
          </div>
          {description ? <div className="mt-1 break-words text-sm text-muted-foreground">{description}</div> : null}
        </div>
      </div>
      {actions ? (
        <div className={cn('flex flex-wrap items-center justify-end gap-2', actionsClassName)}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
