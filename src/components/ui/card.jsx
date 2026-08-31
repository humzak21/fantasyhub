import * as React from "react"
import { cn } from "../../lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // The material, in one place.
      //
      // A flat `border + shadow-sm` rectangle is the shadcn default and reads
      // as a box drawn on the page. What makes a surface look *lit* is the
      // top edge catching light: the inset highlight below is a one-pixel
      // white line along the top of every card, which is why real interfaces
      // built this way (Linear, Vercel, macOS sheets) feel like objects rather
      // than outlines. The drop shadow is nearly black because the ground is
      // nearly black — a grey shadow on black is a grey smudge.
      "rounded-xl border border-border bg-card text-card-foreground",
      "shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

// Padding steps down on a phone. `p-6` left ~327px of usable width inside a
// 375px viewport — the card was spending a sixth of the screen on its own
// margins, and it was the only panel padding in the app that never adapted
// (dialog, sheet and drawer all already stepped down).
const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-header"
    className={cn("flex flex-col space-y-1.5 p-4 sm:p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

// `text-2xl` for every card title is why the type scale had 33 uses of
// `text-2xl` and 3 of `text-xl`: there was no step between a section heading
// and a page title, so every card shouted. Page titles are `PageHeader`'s job
// now; a card title is a heading.
const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

// Full padding on all four sides. The top is removed only when a CardHeader
// is *directly above* it, by a rule in globals.css keyed on these data-slots.
//
// This was a flat `p-4 pt-0`, which assumed every CardContent follows a
// header — plenty do not, and those rendered with their first line jammed
// against the card's top edge. The first attempt at a fix asked
// `:not(:first-child)`, which is the same assumption one step removed: it
// treats *any* preceding sibling as a header, and the rankings "league
// leaders" card puts an absolutely-positioned colour rail before its content,
// so it stayed broken. An adjacent-sibling rule asks the actual question.
const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} data-slot="card-content" className={cn("p-4 sm:p-6", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-footer"
    className={cn("flex items-center p-4 sm:p-6", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }