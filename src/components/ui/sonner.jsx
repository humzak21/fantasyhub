import { Toaster as SonnerToaster } from "sonner"

import { useDarkMode } from "../../contexts/DarkModeContext.jsx"

/**
 * Toasts. Mounted once, in main.jsx.
 *
 * `position="top-center"` on a phone deliberately: a bottom toast lands on the
 * home indicator and under the standings drawer trigger, and it is the part of
 * the screen a thumb is already covering.
 */
export function Toaster(props) {
  const { isDarkMode } = useDarkMode()

  return (
    <SonnerToaster
      theme={isDarkMode ? "dark" : "light"}
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "group border border-border bg-card text-card-foreground shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}
