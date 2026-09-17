import * as React from 'react';
import { cn } from '@/lib/utils';
import { TemporalInput } from './temporal-input';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onChange, onWheel, step, ...props }, ref) => {
    if (type && ['date', 'month', 'time', 'datetime-local'].includes(type)) {
      return (
        <TemporalInput
          {...props}
          ref={ref}
          type={type as 'date' | 'month' | 'time' | 'datetime-local'}
          className={className}
          onChange={onChange}
        />
      );
    }

    const resolvedStep = step ?? (type === 'datetime-local' || type === 'time' ? 1 : undefined);
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
        onChange={onChange}
        onWheel={handleWheel}
        {...props}
      />;
  },
);
Input.displayName = 'Input';

export { Input };
