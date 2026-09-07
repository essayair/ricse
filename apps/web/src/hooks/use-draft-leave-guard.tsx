'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type PendingNavigation =
  | { kind: 'url'; href: string }
  | { kind: 'back' };

interface DraftLeaveGuardOptions {
  dirty: boolean;
  saving: boolean;
  onSaveDraft: () => Promise<void>;
  itemName?: string;
}

export function useDraftLeaveGuard({
  dirty,
  saving,
  onSaveDraft,
  itemName = '内容',
}: DraftLeaveGuardOptions) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const dirtyRef = useRef(dirty);
  const bypassRef = useRef(false);
  const historyGuardRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const navigate = useCallback((target: PendingNavigation) => {
    bypassRef.current = true;
    setPending(null);
    if (target.kind === 'back') {
      // 当前页为原地址和拦截哨兵两个历史记录，后退两步才是用户原本的目标页。
      window.history.go(-2);
      return;
    }
    router.push(target.href);
  }, [router]);

  const requestLeave = useCallback((href: string) => {
    const target: PendingNavigation = { kind: 'url', href };
    if (!dirtyRef.current || bypassRef.current) {
      navigate(target);
      return;
    }
    setPending(target);
  }, [navigate]);

  const leaveNow = useCallback((href: string) => {
    dirtyRef.current = false;
    navigate({ kind: 'url', href });
  }, [navigate]);

  useEffect(() => {
    if (!dirty || historyGuardRef.current) return;
    window.history.pushState({ ...window.history.state, __ricseDraftGuard: true }, '', window.location.href);
    historyGuardRef.current = true;
  }, [dirty]);

  useEffect(() => {
    const handlePopState = () => {
      if (bypassRef.current || !dirtyRef.current || !historyGuardRef.current) return;
      historyGuardRef.current = false;
      window.history.pushState({ ...window.history.state, __ricseDraftGuard: true }, '', window.location.href);
      historyGuardRef.current = true;
      setPending({ kind: 'back' });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || bypassRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleLinkClick = (event: MouseEvent) => {
      if (!dirtyRef.current || bypassRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(element instanceof HTMLAnchorElement) || element.target === '_blank' || element.hasAttribute('download')) return;
      const url = new URL(element.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const target = `${url.pathname}${url.search}${url.hash}`;
      if (target === current) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: 'url', href: target });
    };
    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, []);

  const saveAndLeave = async () => {
    if (!pending) return;
    try {
      await onSaveDraft();
      dirtyRef.current = false;
      navigate(pending);
    } catch (error: any) {
      alert(error.message || `${itemName}草稿保存失败`);
    }
  };

  const dialog = (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && !saving && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>是否保存正在填写的{itemName}？</DialogTitle>
          <DialogDescription>
            当前内容尚未保存。保存后会生成或更新一份草稿，下次可以继续填写。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={saving} onClick={() => setPending(null)}>继续填写</Button>
          <Button variant="ghost" disabled={saving} onClick={() => pending && navigate(pending)}>不保存并离开</Button>
          <Button disabled={saving} onClick={() => void saveAndLeave()}>{saving ? '保存中...' : '保存草稿并离开'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestLeave, leaveNow, dialog };
}
