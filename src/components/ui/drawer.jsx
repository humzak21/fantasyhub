import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "../../lib/utils"

/**
 * A bottom drawer, dragged with the thumb.
 *
 * This is the phone counterpart to `dialog`: on a small screen a centred modal
 * asks the user to reach the middle of the display, while a bottom sheet lands
 * where the thumb already is and can be dismissed by flicking down. vaul owns
 * the drag physics, focus trapping and the scroll lock — and it locks scroll
 * without setting `touch-action: none` on <body>, which is what made the old
 * hand-rolled nav panel untouchable.
 */
const Drawer = ({ shouldScaleBackground = true, ...props }) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger
const DrawerPortal = DrawerPrimitive.Portal
const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-black/70", className)} {...props} />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        // `max-h-[85dvh]`, and the body below it scrolls — never the drawer.
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85dvh] flex-col rounded-t-xl border-t border-border bg-background",
        className
      )}
      {...props}
    >
      {/* Grab handle. It is decorative — the whole header area is draggable —
          but without it nothing signals that the sheet can be flicked away. */}
      <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/40" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({ className, ...props }) => (
  <div className={cn("grid gap-1.5 p-4 text-left", className)} {...props} />
)
DrawerHeader.displayName = "DrawerHeader"

/** The scrolling region. `pb-safe` keeps the last row clear of the home indicator. */
const DrawerBody = ({ className, ...props }) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-safe", className)} {...props} />
)
DrawerBody.displayName = "DrawerBody"

const DrawerFooter = ({ className, ...props }) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4 pb-safe", className)} {...props} />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
