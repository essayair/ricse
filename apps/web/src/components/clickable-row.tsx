'use client';

import type { HTMLAttributes, KeyboardEvent, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

/** 行内这些元素有自己的行为（按钮、链接、表单控件），点击它们时不触发整行打开。 */
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="checkbox"],[role="menuitem"],[role="combobox"],[data-row-action]';

function fromInteractive(event: { target: EventTarget; currentTarget: HTMLElement }) {
  const target = event.target as HTMLElement | null;
  const hit = target?.closest?.(INTERACTIVE);
  return Boolean(hit && hit !== event.currentTarget && event.currentTarget.contains(hit));
}

function selectingText() {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

type ClickableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  /** 详情页地址。提供时支持 Ctrl/⌘ + 点击、中键在新标签页打开。 */
  href?: string;
  /** 不跳转页面、改为打开弹窗等场景使用。 */
  onOpen?: () => void;
};

/**
 * 可整行点击打开详情的表格行：
 * - 单击行内空白处打开详情；Ctrl/⌘/Shift + 点击或鼠标中键在新标签页打开；
 * - 点击行内按钮、链接、输入框时只执行它们自己的操作；
 * - 拖选文字（如复制单号）时不跳转；
 * - 可用 Tab 聚焦，按 Enter 打开。
 */
export function ClickableRow({ href, onOpen, className, onClick, onKeyDown, onAuxClick, children, ...rest }: ClickableRowProps) {
  const router = useRouter();

  const open = (newTab: boolean) => {
    if (href && newTab) window.open(href, '_blank', 'noopener');
    else if (href) router.push(href);
    else onOpen?.();
  };

  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || fromInteractive(event) || selectingText()) return;
    open(event.metaKey || event.ctrlKey || event.shiftKey);
  };

  const handleAuxClick = (event: MouseEvent<HTMLTableRowElement>) => {
    onAuxClick?.(event);
    if (event.button !== 1 || !href || event.defaultPrevented || fromInteractive(event)) return;
    event.preventDefault();
    open(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Enter' || event.target !== event.currentTarget) return;
    event.preventDefault();
    open(event.metaKey || event.ctrlKey);
  };

  return (
    <tr
      {...rest}
      tabIndex={0}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onMouseDown={(event) => { rest.onMouseDown?.(event); if (event.button === 1 && href && !fromInteractive(event)) event.preventDefault(); /* 阻止 Windows 中键自动滚动吞掉点击 */ }}
      onKeyDown={handleKeyDown}
      className={cn('cursor-pointer outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', className)}
    >
      {children}
    </tr>
  );
}
