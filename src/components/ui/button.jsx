import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

// Touch sizing lives here, not in a global stylesheet.
//
// globals.css used to put `min-width: 44px; min-height: 44px` on every
// `button` and `[role=button]` in the app. That inflated icon buttons, table
// controls, chips and week arrows alike and is a large part of why the site
// felt zoomed in on a phone — and being a bare element selector, no component
// could opt out of it.
//
// `pointer-coarse:` applies the 44px floor only on a device whose primary
// pointer is a finger, leaves desktop density exactly as it was, and is a
// class like any other, so a caller can override it.
const buttonVariants = cva(
  // 130ms, not 200: below about 150ms a hover reads as the surface responding,
  // above it as an animation playing. Focus is a ring offset from the control
  // so it stays visible against a near-black ground.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium pointer-coarse:min-h-11 ring-offset-background transition-colors duration-[130ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The filled button carries the same top highlight as a card: on black,
        // a flat fill of one colour looks printed on, and one line of light
        // along its top edge makes it an object.
        default:
          "bg-primary text-primary-foreground font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-destructive/90",
        // Outline sits *on* the card, so it takes the card's own surface a
        // step up rather than the page background — a background-coloured
        // button on a card reads as a hole punched through it.
        outline:
          "border border-border bg-secondary/40 hover:bg-accent hover:border-border-strong",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-11 rounded-lg px-6",
        icon: "h-9 w-9 pointer-coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }