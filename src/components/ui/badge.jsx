import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  // `rounded-md`, not `rounded-full`: a pill reads as a control you can press.
  // These are labels, so they take the same corner as the surfaces around them
  // and sit at 11px, which is the size a caption wants next to 14px body text.
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-border bg-secondary text-muted-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border-border text-muted-foreground",
        // Status variants. A badge saying what a value *means* is the
        // replacement for the `bg-green-50 text-green-700` pairs scattered
        // through the feature components, which only render on this dark page
        // because a remap block in globals.css catches those exact selectors.
        success: "border-success/20 bg-success/10 text-success",
        warning: "border-warning/20 bg-warning/10 text-warning",
        info: "border-info/20 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }