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
/*
 * The accent tints the icon, never the figure.
 *
 * Colouring the value meant "111 games played" rendered in the info blue and
 * "132.2 points per game" in the success green — which says those numbers are
 * *informational* and *good*, when they are neither. A total is just a total.
 * Colour on a number should mean the number carries a direction (a gain, a
 * loss, a deviation); everywhere else it is decoration that spends the
 * palette's meaning for nothing.
 */
const ACCENTS = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  info: 'bg-info/12 text-info',
  destructive: 'bg-destructive/12 text-destructive',
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
    const iconTone = ACCENTS[accent] ?? ACCENTS.neutral;

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 sm:p-5',
          'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {label}
          </span>
          {Icon && (
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', iconTone)}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="font-display text-[30px] font-semibold leading-none tracking-[-0.01em] text-foreground sm:text-[34px]">
          {format ? <NumberText value={value} variant={format} /> : value}
        </div>

        {footer && <div className="text-[12px] leading-snug text-muted-foreground">{footer}</div>}
        {children}
      </div>
    );
  }
);
StatCard.displayName = 'StatCard';

export { StatCard };
