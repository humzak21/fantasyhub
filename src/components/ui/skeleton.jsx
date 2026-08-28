import { cn } from "../../lib/utils"

/**
 * A block that occupies the space its content will occupy.
 *
 * Prefer this over a centred spinner for anything with a known shape: the
 * layout does not jump when the data lands, which on a phone is the difference
 * between a page settling and a page flickering.
 */
function Skeleton({ className, ...props }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

export { Skeleton }
