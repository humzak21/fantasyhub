import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';

import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/**
 * The frame every home-page widget renders inside.
 *
 * It owns what every widget would otherwise hand-roll: the card surface, the
 * header (title, icon, a right-hand aside, and the chevron to the tab the
 * widget summarises), and the three states that are not the content —
 * loading (the widget's own `skeleton`, never `null` and never a spinner),
 * a query `error` with a Retry, and `empty`. The widget decides *whether*
 * each applies; the frame decides how it looks, so seven widgets cannot end up
 * with seven different error cards.
 *
 * A render-time crash is the other kind of failure. `HomePage` wraps each
 * widget in an `ErrorBoundary` whose fallback is `WidgetError` below, so one
 * widget failing in either way never takes the page with it.
 *
 * @param {object} props
 * @param {string} props.id - used for the heading's id
 * @param {React.ComponentType} [props.icon]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.aside] - right of the title, before the chevron
 * @param {string} [props.to] - the tab this widget summarises
 * @param {string} [props.toLabel] - accessible name for the chevron
 * @param {() => void} [props.onNavigate] - runs before following `to`
 * @param {boolean} [props.loading]
 * @param {React.ReactNode} [props.skeleton]
 * @param {unknown} [props.error] - a query error; renders the error card
 * @param {() => void} [props.onRetry]
 * @param {React.ReactNode} [props.empty] - rendered in place of children when truthy
 * @param {boolean} [props.flush] - no body padding (tables run edge to edge)
 */
export function HomeWidget({
  id,
  icon: Icon,
  title,
  aside,
  to,
  toLabel,
  onNavigate,
  loading = false,
  skeleton = null,
  error = null,
  onRetry,
  empty = null,
  flush = false,
  className,
  bodyClassName,
  children
}) {
  const headingId = `home-${id}-title`;

  let body;
  if (error) body = <WidgetErrorBody title={title} onRetry={onRetry} />;
  else if (loading) body = skeleton;
  else if (empty) body = empty;
  else body = children;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground',
        'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
        className
      )}
    >
      <header className="flex min-h-12 items-center gap-2 border-b border-border/60 py-1.5 pl-4 pr-1.5">
        <h2
          id={headingId}
          className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold leading-tight tracking-[-0.006em]"
        >
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </h2>
        {aside && <div className="shrink-0 text-[13px] text-muted-foreground">{aside}</div>}
        {to && (
          <Link
            to={to}
            onClick={onNavigate}
            aria-label={toLabel ?? `Open ${typeof title === 'string' ? title : 'tab'}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </header>

      <div className={cn('min-w-0 flex-1', !flush && 'p-4', bodyClassName)}>{body}</div>
    </section>
  );
}

function WidgetErrorBody({ title, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        Couldn&apos;t load {typeof title === 'string' ? title.toLowerCase() : 'this'}.
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * The per-widget `ErrorBoundary` fallback: the widget's own card, saying it
 * failed, with a Retry that remounts it. The neighbours keep rendering.
 */
export function WidgetError({ id, title, resetError }) {
  return (
    <HomeWidget id={`${id}-error`} title={title} error onRetry={resetError}>
      {null}
    </HomeWidget>
  );
}

export default HomeWidget;
