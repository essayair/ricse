import { cn } from '@/lib/utils';

export type StatusTone = 'default' | 'muted' | 'warning' | 'primary' | 'success' | 'destructive';

const STATUS_TONES: Record<string, StatusTone> = {
  DRAFT: 'muted',
  CLOSED: 'muted',
  CANCELLED: 'muted',
  INACTIVE: 'muted',
  DISABLED: 'muted',
  OFFLINE: 'muted',
  RESIGNED: 'muted',
  RETIRED: 'muted',
  DEPLETED: 'muted',
  UNBOUND: 'muted',

  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  PENDING_REVIEW: 'warning',
  PENDING_QC: 'warning',
  PENDING_SAMPLING: 'warning',
  PENDING_SENDING: 'warning',
  PENDING_DECISION: 'warning',
  PENDING_WEIGHING: 'warning',
  PENDING_CONFIRMATION: 'warning',
  RECHECK_REQUIRED: 'warning',
  WAITING_ARRIVAL: 'warning',
  WAITING_WEIGH: 'warning',
  WAITING_WEIGH_REVIEW: 'warning',
  WAITING_QUALITY: 'warning',
  WAITING_ACCEPTANCE_SELECTION: 'warning',
  VARIANCE_PENDING: 'warning',
  READY_TO_POST: 'warning',
  PARTIAL: 'warning',
  SUBMITTED: 'warning',
  NEW: 'warning',
  REPORTED: 'warning',
  REWORK: 'warning',
  MAINTENANCE: 'warning',
  RESERVED: 'warning',
  QUARANTINED: 'warning',

  ISSUED: 'primary',
  RELEASED: 'primary',
  EXECUTING: 'primary',
  DISPATCHED: 'primary',
  IN_PROGRESS: 'primary',
  IN_TRANSIT: 'primary',
  ARRIVED: 'primary',
  RUNNING: 'primary',
  WEIGHING: 'primary',
  SAMPLING: 'primary',
  TESTING: 'primary',
  INSPECTING: 'primary',
  PROCESSING: 'primary',
  FOLLOWING: 'primary',
  MATERIAL_PREPARED: 'primary',
  PARTIAL_COMPLETED: 'primary',
  QUALITY_IN_PROGRESS: 'primary',
  READY_TO_RECEIVE: 'primary',
  RECEIVED_WAIT_POSTING: 'primary',
  READY: 'primary',

  ACTIVE: 'success',
  ENABLED: 'success',
  APPROVED: 'success',
  OTHERS_APPROVED: 'success',
  COMPLETED: 'success',
  FINISHED: 'success',
  REVIEWED: 'success',
  CONFIRMED: 'success',
  RECEIVED: 'success',
  POSTED: 'success',
  PUBLISHED: 'success',
  SUCCEEDED: 'success',
  SIGNED: 'success',
  PASS: 'success',
  VALID: 'success',
  ONLINE: 'success',
  BOUND: 'success',
  AVAILABLE: 'success',

  REJECTED: 'destructive',
  OTHERS_REJECTED: 'destructive',
  FAILED: 'destructive',
  VOIDED: 'destructive',
  SCRAPPED: 'destructive',
  SCRAP: 'destructive',
  INVALID: 'destructive',
  FUSE: 'destructive',
  ABNORMAL: 'destructive',
  EXCEPTION: 'destructive',
  QUALITY_EXCEPTION: 'destructive',
  BLACKLIST: 'destructive',
};

const TONE_CLASSES: Record<StatusTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  primary: 'text-primary',
  success: 'text-success',
  destructive: 'text-destructive',
};

export function statusTone(status?: string | null): StatusTone {
  return status ? STATUS_TONES[status] || 'default' : 'default';
}

export function StatusText({ status, children, tone, className }: {
  status?: string | null;
  children?: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span className={cn('inline text-xs font-normal leading-4', TONE_CLASSES[tone || statusTone(status)], className)}>
      {children ?? status ?? '—'}
    </span>
  );
}
