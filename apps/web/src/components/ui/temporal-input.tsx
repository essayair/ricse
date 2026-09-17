'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

type TemporalType = 'date' | 'month' | 'time' | 'datetime-local';

type TemporalInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type: TemporalType;
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDate(value = new Date()) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function localTime(value = new Date()) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function normalizeValue(type: TemporalType, value?: string) {
  const now = new Date();
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value! : localDate(now);
  if (type === 'month') return /^\d{4}-\d{2}$/.test(value || '') ? value! : localDate(now).slice(0, 7);
  if (type === 'time') {
    if (/^\d{2}:\d{2}:\d{2}$/.test(value || '')) return value!;
    if (/^\d{2}:\d{2}$/.test(value || '')) return `${value}:00`;
    return localTime(now);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value || '')) return value!;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return `${value}:00`;
  return `${localDate(now)}T${localTime(now)}`;
}

function displayValue(type: TemporalType, value: string) {
  return type === 'datetime-local' ? value.replace('T', ' ') : value;
}

function inputHint(type: TemporalType) {
  if (type === 'month') return '请选择月份';
  if (type === 'time') return '请选择时间';
  if (type === 'datetime-local') return '请选择日期和时间';
  return '请选择日期';
}

function datePart(type: TemporalType, value: string) {
  if (type === 'datetime-local') return value.slice(0, 10);
  if (type === 'date') return value;
  return localDate();
}

function timePart(type: TemporalType, value: string) {
  if (type === 'datetime-local') return value.slice(11) || '00:00:00';
  if (type === 'time') return value;
  return '00:00:00';
}

function monthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(year, month, index - mondayOffset + 1);
    return {
      value: localDate(value),
      day: value.getDate(),
      currentMonth: value.getMonth() === month,
    };
  });
}

const TemporalInput = React.forwardRef<HTMLInputElement, TemporalInputProps>(
  ({ type, className, value, defaultValue, onChange, onInput, onFocus, onBlur, min, max, disabled, required, name, id, placeholder, title, ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const [internalValue, setInternalValue] = React.useState(String(defaultValue || ''));
    const committedValue = value === undefined ? internalValue : String(value || '');
    const [draft, setDraft] = React.useState(() => normalizeValue(type, committedValue));
    const initialDate = datePart(type, draft).split('-').map(Number);
    const [viewYear, setViewYear] = React.useState(initialDate[0]);
    const [viewMonth, setViewMonth] = React.useState(initialDate[1] - 1);
    const [open, setOpen] = React.useState(false);
    const [position, setPosition] = React.useState({ top: 0, left: 0, width: 320 });

    const setRef = React.useCallback((node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);

    const updatePosition = React.useCallback(() => {
      const node = inputRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const panelWidth = type === 'time' ? 288 : 336;
      const estimatedHeight = type === 'time' ? 184 : type === 'month' ? 330 : type === 'datetime-local' ? 462 : 386;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
      const below = rect.bottom + 6;
      const top = below + estimatedHeight <= window.innerHeight
        ? below
        : Math.max(8, rect.top - estimatedHeight - 6);
      setPosition({ top, left, width: panelWidth });
    }, [type]);

    const openPanel = React.useCallback(() => {
      if (disabled) return;
      const nextDraft = normalizeValue(type, committedValue);
      const [year, month] = datePart(type, nextDraft).split('-').map(Number);
      setDraft(nextDraft);
      setViewYear(year);
      setViewMonth(month - 1);
      setOpen(true);
      window.requestAnimationFrame(updatePosition);
    }, [committedValue, disabled, type, updatePosition]);

    React.useEffect(() => {
      if (!open) return undefined;
      const reposition = () => updatePosition();
      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (!panelRef.current?.contains(target) && !inputRef.current?.contains(target)) setOpen(false);
      };
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);
      document.addEventListener('mousedown', handlePointerDown);
      return () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
        document.removeEventListener('mousedown', handlePointerDown);
      };
    }, [open, updatePosition]);

    const emit = (nextValue: string) => {
      if (value === undefined) setInternalValue(nextValue);
      const syntheticEvent = {
        target: { value: nextValue, name },
        currentTarget: { value: nextValue, name },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange?.(syntheticEvent);
      onInput?.(syntheticEvent as unknown as React.FormEvent<HTMLInputElement>);
    };

    const confirm = () => {
      emit(draft);
      setOpen(false);
    };

    const clear = () => {
      emit('');
      setOpen(false);
    };

    const changeMonth = (delta: number) => {
      const next = new Date(viewYear, viewMonth + delta, 1);
      setViewYear(next.getFullYear());
      setViewMonth(next.getMonth());
    };

    const selectDate = (nextDate: string) => {
      if (type === 'datetime-local') setDraft(`${nextDate}T${timePart(type, draft)}`);
      else setDraft(nextDate);
      const [year, month] = nextDate.split('-').map(Number);
      setViewYear(year);
      setViewMonth(month - 1);
    };

    const selectTime = (index: number, next: string) => {
      const parts = timePart(type, draft).split(':');
      parts[index] = next;
      const nextTime = `${parts[0] || '00'}:${parts[1] || '00'}:${parts[2] || '00'}`;
      setDraft(type === 'datetime-local' ? `${datePart(type, draft)}T${nextTime}` : nextTime);
    };

    const minDate = typeof min === 'string' ? min.slice(0, type === 'month' ? 7 : 10) : '';
    const maxDate = typeof max === 'string' ? max.slice(0, type === 'month' ? 7 : 10) : '';
    const selectedDate = datePart(type, draft);
    const selectedMonth = type === 'month' ? draft : selectedDate.slice(0, 7);
    const times = timePart(type, draft).split(':');

    return (
      <>
        <span className="relative block w-full">
          <input
            {...props}
            ref={setRef}
            id={id}
            name={name}
            type="text"
            inputMode="none"
            readOnly
            required={required}
            disabled={disabled}
            value={displayValue(type, committedValue)}
            placeholder={placeholder || inputHint(type)}
            title={title || inputHint(type)}
            onClick={openPanel}
            onFocus={(event) => {
              onFocus?.(event);
              openPanel();
            }}
            onBlur={onBlur}
            onKeyDown={(event) => {
              props.onKeyDown?.(event);
              if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === ' ') {
                event.preventDefault();
                openPanel();
              }
              if (event.key === 'Escape') setOpen(false);
            }}
            className={cn(
              'flex h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
            {type === 'time'
              ? <Clock3 className="h-4 w-4" />
              : <CalendarDays className="h-4 w-4" />}
          </span>
        </span>
        {open && typeof document !== 'undefined' && createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="日期时间选择"
            className="fixed z-[100] rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
            style={{ top: position.top, left: position.left, width: position.width }}
          >
            {type !== 'time' && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" className="rounded-md p-1.5 hover:bg-muted" onClick={() => type === 'month' ? setViewYear(year => year - 1) : changeMonth(-1)} aria-label="上一个月">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="text-sm font-semibold">{viewYear} 年{type === 'month' ? '' : ` ${viewMonth + 1} 月`}</div>
                  <button type="button" className="rounded-md p-1.5 hover:bg-muted" onClick={() => type === 'month' ? setViewYear(year => year + 1) : changeMonth(1)} aria-label="下一个月">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {type === 'month' ? (
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 12 }, (_, index) => {
                      const monthValue = `${viewYear}-${pad(index + 1)}`;
                      const unavailable = Boolean((minDate && monthValue < minDate) || (maxDate && monthValue > maxDate));
                      return <button key={monthValue} type="button" disabled={unavailable} onClick={() => setDraft(monthValue)} className={cn('rounded-md px-2 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30', selectedMonth === monthValue && 'bg-primary text-primary-foreground hover:bg-primary')}>{index + 1} 月</button>;
                    })}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 pb-1 text-center text-xs text-muted-foreground">
                      {WEEKDAYS.map(day => <span key={day} className="py-1">{day}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {monthDays(viewYear, viewMonth).map(day => {
                        const unavailable = Boolean((minDate && day.value < minDate) || (maxDate && day.value > maxDate));
                        return <button key={day.value} type="button" disabled={unavailable} onClick={() => selectDate(day.value)} className={cn('h-8 rounded-md text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30', !day.currentMonth && 'text-muted-foreground/50', selectedDate === day.value && 'bg-primary text-primary-foreground hover:bg-primary')}>{day.day}</button>;
                      })}
                    </div>
                  </>
                )}
              </>
            )}
            {(type === 'time' || type === 'datetime-local') && (
              <div className={cn('grid grid-cols-3 gap-2', type === 'datetime-local' && 'mt-3 border-t pt-3')}>
                {[
                  { label: '时', value: times[0] || '00', length: 24 },
                  { label: '分', value: times[1] || '00', length: 60 },
                  { label: '秒', value: times[2] || '00', length: 60 },
                ].map((part, index) => (
                  <label key={part.label} className="space-y-1 text-xs text-muted-foreground">
                    <span>{part.label}</span>
                    <select value={part.value} onChange={event => selectTime(index, event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">
                      {Array.from({ length: part.length }, (_, item) => <option key={item} value={pad(item)}>{pad(item)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <button type="button" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={clear}>清空</button>
              <button type="button" className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" onClick={confirm}>确认</button>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  },
);

TemporalInput.displayName = 'TemporalInput';

export { TemporalInput };
