'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface BusinessOperationLog {
  id: string;
  action: string;
  actionLabel: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  operator: { id: string; name: string; username: string };
}

export function BusinessOperationHistory({ logs = [] }: { logs?: BusinessOperationLog[] }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}') as { role?: string; roles?: string[] };
      setIsAdmin(user.role === 'ADMIN' || Boolean(user.roles?.includes('ADMIN')));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="flex justify-end">
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            操作记录
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              操作记录
            </DialogTitle>
            <DialogDescription>仅系统管理员可查看单据操作人员、登录账号和操作时间。</DialogDescription>
          </DialogHeader>
          {!logs.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无操作记录</div>
          ) : (
            <div className="max-h-[60vh] divide-y overflow-y-auto">
              {logs.map((log) => {
                const note = operationNote(log.details);
                return (
                  <div key={log.id} className="grid gap-1 px-6 py-3 sm:grid-cols-[minmax(150px,1fr)_minmax(140px,220px)_170px] sm:items-center sm:gap-4">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}

function operationNote(details?: Record<string, unknown> | null) {
  if (!details) return '';
  const value = details.reason || details.remarks || details.remark;
  return typeof value === 'string' ? value : '';
}
