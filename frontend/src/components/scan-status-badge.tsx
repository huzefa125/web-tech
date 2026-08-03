import { Badge } from '@/components/ui/badge';
import type { ScanStatus } from '@/lib/types';

const LABELS: Record<ScanStatus, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  running: { label: 'Running', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  succeeded: {
    label: 'Succeeded',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  failed: { label: 'Failed', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground border-border' },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const { label, className } = LABELS[status];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

/** True while the scan can still change on its own — drives polling. */
export function isPending(status: ScanStatus): boolean {
  return status === 'queued' || status === 'running';
}
