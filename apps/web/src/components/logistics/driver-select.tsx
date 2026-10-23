'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface DriverOption { id: string; name: string; phone: string; keywords?: string }

/** 搜索仅用于候选过滤；必须明确选中，才能写入司机快照。 */
export function DriverSelect({ options, value, disabled, onSelect, onManual }: {
  options: DriverOption[]; value: string; disabled?: boolean;
  onSelect: (id: string) => void; onManual: () => void;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find(option => option.id === value);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return options.filter(option => !keyword || [option.name, option.phone, option.keywords || ''].some(text => text.toLowerCase().includes(keyword)));
  }, [options, search]);

  const show = () => {
    if (!anchor.current || disabled) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
    const height = Math.min(360, window.innerHeight - 24);
    setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: rect.bottom + height > window.innerHeight && rect.top > height ? rect.top - height - 4 : Math.min(rect.bottom + 4, window.innerHeight - height - 12) });
    setSearch(''); setActive(0); setOpen(true);
  };
  const choose = (id: string) => { onSelect(id); setOpen(false); anchor.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [open]);

  return <>
    <button ref={anchor} type="button" role="combobox" aria-label="选择司机" aria-expanded={open} aria-controls={open ? listId : undefined}
      disabled={disabled} onClick={() => open ? setOpen(false) : show()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); } }}
      className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-left text-sm disabled:opacity-50">
      <span className="truncate">{selected ? `${selected.name} · ${selected.phone}` : '搜索并选择司机'}</span><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
    {open && createPortal(<div ref={panel} style={position} className="fixed z-[100] rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
      <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input ref={input} aria-label="搜索司机" role="combobox" aria-expanded aria-controls={listId}
        aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined} className="h-9 pl-8" placeholder="姓名、手机号、承运商或车队" value={search}
        onChange={event => { setSearch(event.target.value); setActive(0); }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); anchor.current?.focus(); }
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.max(0, Math.min(index + 1, filtered.length - 1))); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
          if (event.key === 'Enter') { event.preventDefault(); if (filtered[active]) choose(filtered[active].id); }
        }} /></div>
      <div id={listId} role="listbox" aria-label="司机候选" className="mt-2 max-h-56 overflow-y-auto">
        {filtered.map((option, index) => <button key={option.id} id={`${listId}-${index}`} type="button" role="option" aria-selected={option.id === value}
          className={`block w-full rounded px-2 py-2 text-left text-sm ${index === active ? 'bg-accent' : 'hover:bg-accent'}`}
          onMouseEnter={() => setActive(index)} onClick={() => choose(option.id)}>
          <span>{option.name} · {option.phone}</span>{option.keywords && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{option.keywords}</span>}
        </button>)}
        {!filtered.length && <p className="px-2 py-4 text-sm text-muted-foreground">暂无匹配司机，可手工填写</p>}
      </div>
      <button type="button" className="mt-2 w-full border-t px-2 pt-2 text-left text-sm text-primary" onClick={() => { setOpen(false); onManual(); }}>手工填写临时司机</button>
    </div>, document.body)}
  </>;
}
