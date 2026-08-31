import { cn } from '../../lib/utils';

/**
 * The one page header.
 *
 * There were four incompatible versions of this: a `CardHeader` with a
 * `CardTitle`, an `h2` with an inline icon and a raw button beside it, an
 * icon-tile-plus-description block, and — for the rankings — sixty lines of
 * title, badge, switch and toggle written inline in the app shell. They
 * disagreed on type size, icon treatment, whether the actions wrapped, and
 * where the vertical rhythm came from, so moving between two tabs felt like
 * moving between two apps.
 *
 * The title is set in the display face: it is the one place per page where the
 * scoreboard voice belongs.
 *
 * @param {object} props
 * @param {React.ComponentType} [props.icon] - lucide icon component
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description] - one line; longer belongs in the page
 * @param {React.ReactNode} [props.badge] - sits inline after the title
 * @param {React.ReactNode} [props.actions] - right-aligned controls; wrap below sm
 * @param {React.ReactNode} [props.children] - a filter or toolbar row under the header
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  badge,
  actions,
  className,
  children,
  ...props
}) {
  return (
    <div className={cn('mb-5 sm:mb-6', className)} {...props}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary sm:h-10 sm:w-10">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="font-display text-2xl font-semibold leading-none tracking-tight sm:text-3xl">
                {title}
              </h1>
              {badge}
            </div>
            {description && (
              <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export default PageHeader;
