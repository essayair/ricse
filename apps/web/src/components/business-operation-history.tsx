import { History } from 'lucide-react';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Card } from '@/components/ui/card';

export interface BusinessOperationLog {
  id: string;
  action: string;
  actionLabel: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  operator: { id: string; name: string; username: string };
}

export function BusinessOperationHistory({ logs = [] }: { logs?: BusinessOperationLog[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b p-5">
        <History className="h-4 w-4 text-primary" />
        <div>
          <h2 className="font-semibold">操作记录</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">记录单据创建、编辑、状态变化及关键业务操作</p>
        </div>
      </div>
      {!logs.length ? (
        <div className="p-8 text-center text-sm text-muted-foreground">暂无操作记录</div>
      ) : (
        <div className="divide-y">
          {logs.map((log) => {
            const note = operationNote(log.details);
            return (
              <div key={log.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(150px,1fr)_minmax(140px,220px)_170px] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{log.actionLabel}</div>
                  {note && <div className="mt-1 truncate text-xs text-muted-foreground" title={note}>{note}</div>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {log.operator.name || log.operator.username}
                  {log.operator.name && log.operator.username && <span className="ml-1 text-xs">（{log.operator.username}）</span>}
                </div>
                <div className="text-xs text-muted-foreground sm:text-right">{formatDateTimeToSecond(log.createdAt, '-')}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function operationNote(details?: Record<string, unknown> | null) {
  if (!details) return '';
  const value = details.reason || details.remarks || details.remark;
  return typeof value === 'string' ? value : '';
}
