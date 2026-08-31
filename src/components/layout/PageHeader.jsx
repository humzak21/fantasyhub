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
    <div className={cn('mb-6 sm:mb-8', className)} {...props}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* The icon is a marker, not a feature. A filled brand-coloured tile
              at the top of every page competes with the page's own accent for
              attention and makes eight tabs look like eight products. */}
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {/* Tight tracking is most of what makes large type look set
                  rather than typed. Barlow Condensed at -0.01em keeps the
                  scoreboard voice from feeling loose at display size. */}
              <h1 className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[32px]">
                {title}
              </h1>
              {badge}
            </div>
            {description && (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export default PageHeader;
