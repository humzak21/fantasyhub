import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "../../lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  // `dvh`, not `vh`: on iOS Safari `100vh` is the *expanded* viewport, so a
  // full-height panel sized in vh runs under the address bar and its last row
  // is unreachable. This is the bug the old mobile nav panel had.
  //
  // A sheet slides the whole way in from its edge and the whole way back out,
  // and takes longer over it than a menu does: the `animate-in` default of
  // 150ms is right for a popover appearing next to its trigger and reads as a
  // flash on a panel the width of the screen. Radix keeps the element mounted
  // until the exit animation ends, so closing — by the X, by Escape, or by a
  // click on the backdrop — slides out the same way.
  [
    "fixed z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-background p-4 shadow-lg transition-none sm:p-6",
    "[--ff-enter-duration:320ms] [--ff-exit-duration:240ms]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
  ],
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[85dvh] border-b border-border pt-safe data-[state=open]:slide-in-from-top-full data-[state=closed]:slide-out-to-top-full",
        bottom:
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border pb-safe data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full",
        left: "inset-y-0 left-0 h-dvh w-[85vw] max-w-sm border-r border-border data-[state=open]:slide-in-from-left-full data-[state=closed]:slide-out-to-left-full",
        right:
          "inset-y-0 right-0 h-dvh w-[85vw] max-w-sm border-l border-border data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full",
      },
    },
    defaultVariants: { side: "right" },
  }
)

/**
 * `hideClose` drops the corner X for a sheet whose content renders its own
 * close control in a header row — two X buttons a few pixels apart is not a
 * choice anybody wants to make. The sheet is still closable by Escape and by
 * the backdrop either way; the caller is responsible for the visible one.
 */
const SheetContent = React.forwardRef(
  ({ side = "right", hideClose = false, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      {!hideClose && (
        <SheetPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none pointer-coarse:p-2">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
  )
)
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 pr-8 text-left", className)} {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({ className, ...props }) => (
  <div
    className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold tracking-tight", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
