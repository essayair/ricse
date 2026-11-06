'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { hasListQuery, mergeListQuery, pickListQuery, readListQuery, type ListQueryValues } from './list-query';

function readStored(key: string) {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string) {
  try { window.sessionStorage.setItem(key, value); } catch { /* 隐私模式等场景下不记忆，不影响使用 */ }
}

/**
 * 列表筛选条件保存在 URL 查询参数中：浏览器后退、刷新、新标签页打开都能还原。
 * 从详情页的返回按钮、面包屑或侧边栏回到列表（URL 不带筛选参数）时，
 * 自动恢复本次会话中该列表最近一次的筛选条件。
 *
 * `defaults` 声明本列表全部筛选键及默认值，值一律为字符串。
 * `scopeParams` 用于同一地址下按页签区分的列表（如 `?tab=partners`），各页签分别记忆筛选条件。
 */
export function useListQuery<T extends ListQueryValues>(defaults: T, { scopeParams = ['tab'] }: { scopeParams?: string[] } = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultsRef = useRef(defaults);
  const scope = scopeParams.map((name) => `${name}=${searchParams.get(name) ?? ''}`).join('&');
  const storageKey = `ricse:list-query:${pathname}?${scope}`;
  // 首次进入或切换页签时，URL 不带筛选参数则取本会话记忆的条件。
  const restoreFor = (key: string) => (hasListQuery(searchParams, defaults) ? null : readStored(key) || null);
  const [restore, setRestore] = useState(() => ({ key: storageKey, qs: restoreFor(storageKey) }));
  if (restore.key !== storageKey) setRestore({ key: storageKey, qs: restoreFor(storageKey) });
  const pendingRestore = restore.key === storageKey ? restore.qs : null;

  useEffect(() => {
    if (pendingRestore === null) return;
    const qs = mergeListQuery(window.location.search.slice(1), {}, Object.fromEntries(new URLSearchParams(pendingRestore)));
    window.history.replaceState(null, '', `${pathname}?${qs}`);
    setRestore({ key: storageKey, qs: null });
  }, [pathname, pendingRestore, storageKey]);

  const current = searchParams.toString();
  useEffect(() => {
    if (pendingRestore === null) writeStored(storageKey, pickListQuery(current, defaultsRef.current));
  }, [current, storageKey, pendingRestore]);

  const query = useMemo(
    () => readListQuery(pendingRestore === null ? new URLSearchParams(current) : new URLSearchParams(pendingRestore), defaultsRef.current),
    [current, pendingRestore],
  );

  const setQuery = useCallback((patch: Partial<T>) => {
    const qs = mergeListQuery(window.location.search.slice(1), defaultsRef.current, patch);
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [pathname]);

  const resetQuery = useCallback(() => setQuery(defaultsRef.current), [setQuery]);

  return [query, setQuery, resetQuery] as const;
}
