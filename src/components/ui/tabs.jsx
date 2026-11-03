import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "../../lib/utils"

const Tabs = TabsPrimitive.Root

/**
 * Scrollable by default.
 *
 * Six sites in this app wrote `<TabsList className="grid grid-cols-5">`, which
 * divides the available width by the number of tabs regardless of how long
 * their labels are. At 375px that is ~60px a tab and the labels overlap into
 * each other. A tab strip that is wider than its container should scroll, not
 * squash — so the list scrolls horizontally and its triggers keep their
 * natural width.
 *
 * `grid-cols-*` still works if a caller passes it (the class lands after these
 * in cn()), but there is now no reason to.
 */
const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-auto min-h-10 max-w-full items-center justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-muted p-1 text-muted-foreground shadow-sm scrollbar-mobile mobile-scroll",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

/**
 * Pass `icon` and below sm: the label moves under the icon, small; from sm:
 * they sit side by side. A strip where the names matter (League History) puts
 * the icon in `children` instead: it keeps every title at one size and
 * scrolls.
 *
 * The label is never dropped. It used to collapse to the icon alone below
 * sm:, which left Pick'ems, Playoffs and Awards as a row of four unlabelled
 * glyphs on a phone — a crosshair for TD Parlay, two trophies for Results and
 * Standings — and a member could not tell the tabs apart. Icon over an
 * 11px label is what the phone tab bar does, and it costs the strip about
 * 14px of height.
 */
const TabsTrigger = React.forwardRef(({ className, icon, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-muted-foreground/10 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow pointer-coarse:min-h-9 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      icon && "flex-col gap-0.5 px-2.5 py-1 sm:flex-row sm:gap-2 sm:px-3 sm:py-1.5",
      className
    )}
    {...props}
  >
    {icon ? (
      <>
        {icon}
        <span className="text-[11px] font-medium leading-none sm:text-sm sm:leading-normal">{children}</span>
      </>
    ) : (
      children
    )}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }