#!/usr/bin/env bash
#
# Grep guards for the specific mistakes this codebase has actually made.
#
# Every rule below is here because the thing it forbids shipped, stayed for
# months, and broke the site on a phone. None of them is a style preference; a
# reviewer can read the message and see the bug. If a rule ever fires on
# something legitimate, delete the rule — a guard nobody believes gets
# `|| true`'d, and then it guards nothing.
#
# Comment lines are stripped before matching. Several of these patterns are
# described in prose in the very code that fixed them (including this file),
# and a guard that fires on its own explanation is a guard people disable.
#
# Usage: scripts/check-mobile-conventions.sh

set -uo pipefail
cd "$(dirname "$0")/.."

SRC=(src hooks utils services types FantasyFootballApp.jsx globals.css index.html)
EXCLUDES=(--exclude-dir=__tests__ --exclude-dir=node_modules --exclude-dir=dist)

failed=0

# check <name> <pattern> <explanation> <path...>
check() {
  local name="$1" pattern="$2" why="$3"; shift 3

  local hits
  hits=$(
    grep -rnE "${EXCLUDES[@]}" -- "$pattern" "$@" 2>/dev/null |
      # Drop matches that live in a comment. `path:line:code` — look at the
      # code, and skip it if it starts a line comment or continues a block one.
      awk -F: '{ code = $0; sub(/^[^:]*:[0-9]+:/, "", code);
                 gsub(/^[ \t]+/, "", code);
                 if (code ~ /^(\/\/|\/\*|\*|#)/) next;
                 print }'
  )

  if [[ -n "$hits" ]]; then
    failed=1
    printf '\n❌ %s\n\n%s\n\n%s\n' "$name" "$hits" "$why"
  fi
}

check "viewport zoom is disabled" \
  'user-scalable=no|maximum-scale=1' \
  "   Pinch-zoom is a WCAG 1.4.4 requirement, and while the fixed-width bugs
   were live it was the only way to see content that ran off the screen. A
   script used to rewrite the viewport meta at runtime to add this." \
  "${SRC[@]}"

check "touch-action is being disabled" \
  "touchAction *[:=] *['\"]none|touch-action: *none" \
  "   Setting this on <body> to lock scrolling also kills touch *inside* any
   panel above it — a descendant's own 'pan-y' cannot re-enable what an
   ancestor turned off. That is the original \"the sidebar doesn't scroll\"
   bug. Lock scrolling with 'overflow: hidden' alone." \
  "${SRC[@]}"

check "a transform on the app root" \
  'translateZ\(0\)' \
  "   A transformed element becomes the containing block for every
   'position: fixed' descendant, so overlays and drawers size and position
   against it instead of the viewport. This sat on <body> as a 'performance
   optimisation' and broke every fixed element in the app." \
  src/App.jsx globals.css

check "an import of the deleted UA-sniffing module" \
  'mobileDetection' \
  "   utils/mobileDetection.js is gone. Rendering decisions come from viewport
   width — CSS breakpoints, or useIsMobile — never from the user agent. An
   iPad is not a phone, and a narrow desktop window is." \
  "${SRC[@]}"

# Deliberately only the *inline* form. A responsive class pair like
# `h-[260px] sm:h-[400px]` is the pattern this rule wants people to use, so
# matching on `h-[NNNpx]` at all would fire on the fix.
check "an inline pixel height on a chart" \
  'style=\{\{ *height: *[0-9]' \
  "   A 520px chart is 139% of an iPhone SE viewport, and an inline style
   cannot be overridden by a caller or a breakpoint. Let ChartContainer size
   it ('h-[260px] sm:h-[400px]' by default), or pass a responsive height
   class." \
  src/components/statistics src/components/history/charts src/components/dashboard

check "justify-center on a horizontal scroll container" \
  'justify-center[^"]*overflow-x-auto|overflow-x-auto[^"]*justify-center' \
  "   Centring a flex line that overflows pushes the start of it to a negative
   scroll offset, which cannot be reached. That is how round 1 of the playoff
   bracket became unviewable. Use 'w-max mx-auto' inside a plain overflow
   container instead." \
  src/components

check "a TabsList sized by grid-cols" \
  'TabsList[^>]*grid-cols-' \
  "   Dividing the width by the tab count ignores label length — about 70px a
   tab at 375px, where the labels overlap. TabsList scrolls by default; give
   TabsTrigger an 'icon' if the labels need to collapse." \
  src/components

# Per-file, not per-line: `interval={0}` is correct on desktop, and the charts
# keep it — what makes it safe is `useMobileAxis` being spread after it. So the
# question is whether the file uses the hook at all.
for f in $(grep -rlE --exclude-dir=__tests__ 'interval=\{0\}' src/components 2>/dev/null); do
  if ! grep -q 'useMobileAxis' "$f"; then
    failed=1
    printf '\n❌ interval={0} with no mobile axis overrides\n\n%s\n\n%s\n' "$f" \
"   interval={0} forces every tick to render. At 375px fourteen team labels
   overlap into a grey smear that also overflows the plot area. Keep it for
   desktop, but spread useMobileAxis().x after your own axis props — below the
   breakpoint it substitutes 'preserveStartEnd'."
  fi
done

# Not a grep: the presence of the file is the violation.
twins=$(find src/components -name 'Mobile[A-Z]*.jsx' -not -path '*/__tests__/*' 2>/dev/null)
if [[ -n "$twins" ]]; then
  failed=1
  printf '\n❌ a Mobile* twin of a feature component\n\n%s\n\n%s\n' "$twins" \
"   A phone-specific copy of a feature drifts from the desktop one immediately.
   The shell fork this replaced was missing three whole tabs and never received
   isAdmin, so admin controls could not render on a phone at all. Make the
   component responsive; branch on useIsMobile only when the two are
   structurally different components, not two skins of one tree."
fi

if [[ $failed -eq 0 ]]; then
  echo "✅ Mobile conventions OK."
fi

exit $failed
