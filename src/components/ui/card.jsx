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

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 pt-0 sm:p-6 sm:pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }