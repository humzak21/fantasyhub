import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "../../lib/utils"
import { useIsMobile } from "../../hooks/use-mobile"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = {
  light: "",
  dark: ".dark"
}

/**
 * The categorical series palette.
 *
 * Charts used to pick their own colours: ~200 hardcoded hexes across the
 * chart components, including recharts' default `#8884d8` and — on a dark
 * page — several dark-grey *text* colours (`#1f2937`, `#374151`) used as
 * fills. Series colours come from the theme now.
 *
 * These are `hsl(var(--chart-N))` rather than the `--color-chart-N` theme
 * entries: `@theme inline` inlines those into utilities without emitting a
 * custom property, and recharts needs a value it can resolve at runtime.
 */
const CHART_COLORS = Array.from({ length: 10 }, (_, i) => `hsl(var(--chart-${i + 1}))`)

/** The colour for a series index, wrapping around the palette. */
function chartColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length]
}

const ChartContext = React.createContext(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

/**
 * `h-[260px] sm:h-[400px]`, not `aspect-video`.
 *
 * A 16:9 box is 211px tall inside a 375px screen, which is not a chart — the
 * legend and the axis labels alone eat most of it. A fixed *height* that steps
 * up at sm: gives a readable chart at both ends. Pass `className="h-[…]"` to
 * override; the default is last in the cn() call so a caller's height wins.
 *
 * Do not hardcode a pixel height on the wrapper element instead (several
 * charts in this app carried `style={{ height: 520 }}`, which is 139% of an
 * iPhone SE's viewport) — that is the thing this default exists to replace.
 */
const ChartContainer = React.forwardRef(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex h-[260px] w-full justify-center text-xs sm:h-[400px] [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({
  id,
  config
}) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme || config.color)

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
.map(([key, itemConfig]) => {
const color =
  itemConfig.theme?.[theme] ||
  itemConfig.color
return color ? `  --color-${key}: ${color};` : null
})
.join("\n")}
}
`)
          .join("\n"),
      }} />
  );
}

/**
 * Small-screen *overrides* for a recharts axis. Empty on desktop.
 *
 * Spread these AFTER the chart's own axis props, so a chart keeps its desktop
 * appearance untouched and only changes below the breakpoint:
 *
 *   const axis = useMobileAxis()
 *   <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} {...axis.x} />
 *   <YAxis width={30} {...axis.y} />
 *   <BarChart margin={{ ... }} {...axis.chart}>
 *
 * The failure this exists to prevent is `interval={0}` with angled ticks,
 * which is what every statistics chart here does. `interval={0}` forces every
 * tick to render, so at 375px fourteen angled team names overlap into a grey
 * smear that also overflows the plot area. `preserveStartEnd` lets recharts
 * drop the ticks it cannot fit — correct at any width, and essential at this
 * one.
 *
 * Returning overrides rather than a full axis config is deliberate: a hook
 * that returned complete props would have to guess each chart's desktop
 * styling, and would silently flatten it.
 */
function useMobileAxis() {
  const isMobile = useIsMobile()

  return React.useMemo(() => (isMobile
    ? {
        isMobile,
        x: {
          interval: "preserveStartEnd",
          angle: 0,
          textAnchor: "middle",
          height: 28,
          tick: { fontSize: 10 },
          tickMargin: 4,
          minTickGap: 8,
        },
        y: { width: 30, tick: { fontSize: 10 }, tickMargin: 2, label: undefined },
        // Axis labels and wide gutters are desktop affordances; at 375px they
        // are most of the plot area.
        chart: { margin: { top: 8, right: 8, bottom: 4, left: 0 } },
      }
    : { isMobile, x: {}, y: {}, chart: {} }
  ), [isMobile])
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef((
  {
    active,
    payload,
    className,
    indicator = "dot",
    hideLabel = false,
    hideIndicator = false,
    label,
    labelFormatter,
    labelClassName,
    formatter,
    color,
    nameKey,
    labelKey,
  },
  ref
) => {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === "string"
        ? config[label]?.label || label
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
    <div
      ref={ref}
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}>
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item.color

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}>
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn("shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]", {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent":
                              indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          })}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor
                            }
                          } />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}>
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="tabular font-medium text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
})
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef((
  { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
  ref
) => {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}>
      {payload
        .filter((item) => item.type !== "none")
        .map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}>
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }} />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
})
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config,
  payload,
  key
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey = key

  if (
    key in payload &&
    typeof payload[key] === "string"
  ) {
    configLabelKey = payload[key]
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key] === "string"
  ) {
    configLabelKey = payloadPayload[key]
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  useMobileAxis,
  CHART_COLORS,
  chartColor,
}
// Re-exported so a chart has one import for "what colour is this team": the
// team wheel and the categorical palette are different systems (identity vs.
// series) and a chart usually wants the first.
export { teamChartColor } from "../../utils/teamColors"
