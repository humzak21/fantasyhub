import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The heading of a block of related content — one step below the page title.
 *
 * Section headings used to be 11px uppercase eyebrows in the muted grey: the
 * same size and colour as the card labels beneath them, so a section and a
 * card could not be told apart and neither read as a heading. The grey passed
 * contrast on paper (about 7:1 on the page) and still disappeared, because at
 * 11px the letterforms are too small to read at a glance and all-caps removes
 * the word shapes that help.
 *
 * The heading scale, top to bottom:
 *
 *   page title   PageHeader         26/32px display face
 *   section      SectionHeading     18/20px semibold, foreground, rule below
 *   card         CardTitle / h3     16–18px semibold, foreground
 *   group        "Starters", …      14px semibold, foreground (or a tone)
 *   field label  "Record", "PF"     12–13px medium, muted, sentence case
 *
 * Uppercase is for chips and badges ("YOU", "proj", "BYE"), never for a
 * heading.
 *
 * @param {object} props
 * @param {'h2'|'h3'|'h4'} [props.as] - heading level; h2 by default
 * @param {React.ComponentType} [props.icon] - lucide icon component
 * @param {React.ReactNode} [props.aside] - a count or control at the right end
 * @param {string} [props.className] - applies to the wrapper (margins, spacing)
 */
const SectionHeading = React.forwardRef(
  ({ as: Tag = 'h2', icon: Icon, aside, className, children, ...props }, ref) => (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-border pb-2.5',
        className
      )}
    >
      <Tag
        ref={ref}
        className="flex min-w-0 items-center gap-2.5 text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-xl"
        {...props}
      >
        {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />}
        {children}
      </Tag>
      {aside && <div className="shrink-0 text-sm text-muted-foreground">{aside}</div>}
    </div>
  )
);
SectionHeading.displayName = 'SectionHeading';

export { SectionHeading };
export default SectionHeading;
