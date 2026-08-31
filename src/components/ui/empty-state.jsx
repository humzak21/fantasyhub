import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * What a surface says when it has nothing to show.
 *
 * This pattern — circled icon, heading, muted line — was hand-written in about
 * ten places with a different icon size and wrapper each time, next to a set
 * of `.ff-empty-state*` classes that were written but never used by anything.
 *
 * An empty screen is an invitation to act, so `action` is a first-class prop:
 * where there is something the reader can do, say what it is.
 */
const EmptyState = React.forwardRef(
  ({ icon: Icon, title, description, action, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}
      {...props}
    >
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      {title && <h3 className="text-base font-semibold text-foreground">{title}</h3>}
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
      {children}
    </div>
  )
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
