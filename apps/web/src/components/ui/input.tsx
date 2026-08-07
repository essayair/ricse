import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onChange, onWheel, step, ...props }, ref) => {
    // 纯日期选择完成即可收起；日期时间需要继续选择时、分、秒，不能在选完日期时提前失焦。
    const closesAfterSelection = type === 'date' || type === 'month';
    const resolvedStep = step ?? (type === 'datetime-local' || type === 'time' ? 1 : undefined);
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      if (closesAfterSelection && event.currentTarget.value) {
        const input = event.currentTarget;
        window.requestAnimationFrame(() => input.blur());
      }
    };
    const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
      onWheel?.(event);
      // 浏览页面时不应误改仍处于焦点中的数字字段。
      if (type === 'number' && document.activeElement === event.currentTarget) {
        event.currentTarget.blur();
      }
    };

    return <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        step={resolvedStep}
        onChange={handleChange}
        onWheel={handleWheel}
        {...props}
      />;
  },
);
Input.displayName = 'Input';

export { Input };
