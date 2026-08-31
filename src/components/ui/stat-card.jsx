import * as React from 'react';
import { cn } from '../../lib/utils';
import { NumberText } from './number-text';

/**
 * One figure, labelled.
 *
 * The cards this replaces were built from interpolated class names —
 * `bg-${color}-50`, `text-${color}-600` — which Tailwind's scanner cannot see,
 * so none of them were ever generated. They looked styled only because an
 * unrelated dark-mode remap block happened to catch the same selectors, and
 * any hue outside that block's fixed list rendered as an unstyled box.
 *
 * The accent is a semantic token chosen from a fixed set, so the classes are
 * literal and the meaning travels with the value.
 */
const ACCENTS = {
  neutral: { icon: 'text-muted-foreground bg-muted', value: 'text-foreground' },
  primary: { icon: 'text-primary bg-primary/15', value: 'text-foreground' },
  success: { icon: 'text-success bg-success/15', value: 'text-success' },
  warning: { icon: 'text-warning bg-warning/15', value: 'text-warning' },
  info: { icon: 'text-info bg-info/15', value: 'text-info' },
  destructive: { icon: 'text-destructive bg-destructive/15', value: 'text-destructive' },
};

/**
 * @param {object} props
 * @param {string} props.label - what the figure is
 * @param {React.ReactNode} props.value - the figure itself, or a number with `format`
 * @param {'points'|'percent'|'delta'|'plain'} [props.format] - render value through NumberText
 * @param {React.ComponentType} [props.icon] - lucide icon component
 * @param {'neutral'|'primary'|'success'|'warning'|'info'|'destructive'} [props.accent]
 * @param {React.ReactNode} [props.footer] - one line of context under the value
 */
const StatCard = React.forwardRef(
  (
    { label, value, format, icon: Icon, accent = 'neutral', footer, className, children, ...props },
    ref
  ) => {
    const tone = ACCENTS[accent] ?? ACCENTS.neutral;

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors',
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {Icon && (
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', tone.icon)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className={cn('font-display text-2xl font-semibold leading-none tracking-tight sm:text-3xl', tone.value)}>
          {format ? <NumberText value={value} variant={format} /> : value}
        </div>

        {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
        {children}
      </div>
    );
  }
);
StatCard.displayName = 'StatCard';

export { StatCard };
