'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SYSTEM_DIALOG_EVENT, type SystemDialogRequest } from '@/lib/system-dialog';

export function SystemDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SystemDialogRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<SystemDialogRequest>).detail;
      setValue(next.defaultValue || '');
      setRequest((current) => {
        if (current) current.resolve(current.kind === 'confirm' ? false : null);
        return next;
      });
    };
    window.addEventListener(SYSTEM_DIALOG_EVENT, receive);
    const nativeAlert = window.alert;
    window.alert = (message?: unknown) => {
      const text = String(message ?? '');
      window.dispatchEvent(new CustomEvent<SystemDialogRequest>(SYSTEM_DIALOG_EVENT, {
        detail: {
          kind: 'alert',
          message: text,
          title: /成功|完成|已保存|已提交|已发布/.test(text) ? '操作成功'
            : /失败|错误|异常|无权|不能|无法/.test(text) ? '操作未完成'
              : /请选择|请填写|请输入|请先|必须|至少/.test(text) ? '请完善信息' : '系统提示',
          confirmText: '知道了',
          destructive: /失败|错误|异常|无权|不能|无法/.test(text),
          resolve: () => undefined,
        },
      }));
    };
    return () => {
      window.removeEventListener(SYSTEM_DIALOG_EVENT, receive);
      window.alert = nativeAlert;
    };
  }, []);

  const finish = (result: boolean | string | null) => {
    request?.resolve(result);
    setRequest(null);
  };

  return <>
    {children}
    <Dialog open={!!request} onOpenChange={(open) => !open && finish(request?.kind === 'confirm' ? false : null)}>
      <DialogContent className="max-w-md" onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        {request && <>
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              {request.destructive ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <MessageSquareText className="h-5 w-5" />}
            </div>
            <DialogTitle>{request.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line leading-6 text-foreground/75">{request.message}</DialogDescription>
          </DialogHeader>
          {request.validationItems && <div className="max-h-64 space-y-1 overflow-y-auto" role="list" aria-label="需要完善的字段">
            {request.validationItems.map((item, index) => <button key={`${item.key}-${index}`} type="button" role="listitem" onClick={() => finish(item.key)} className="block w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{index + 1}. {item.message}</button>)}
          </div>}
          {request.kind === 'prompt' && <textarea
            autoFocus
            rows={4}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') finish(value);
            }}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="请填写处理信息"
          />}
          <DialogFooter>
            {request.kind !== 'alert' && <Button variant="outline" onClick={() => finish(request.kind === 'confirm' ? false : null)}>{request.cancelText}</Button>}
            <Button variant={request.destructive ? 'destructive' : 'default'} onClick={() => finish(request.kind === 'prompt' ? value : true)}>{request.confirmText}</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
