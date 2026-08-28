import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '../../lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'

/**
 * One column definition, two layouts.
 *
 * A table with eleven columns does not become usable on a 375px screen by
 * scrolling — the reader loses the row they were on the moment the first
 * column leaves the viewport. The card stack below `sm` is a different *shape*
 * for the same data: the identifying columns become the card's header, the
 * numbers people actually scan become a small grid, and the long tail folds
 * away behind a disclosure.
 *
 * Both branches are rendered and CSS-switched (`sm:hidden` / `hidden sm:block`)
 * rather than picked in JS. That is deliberate:
 *
 *   - one `columns` array drives both, so the two cannot drift — the failure
 *     mode of every hand-written mobile twin in this repo's history;
 *   - no `matchMedia` read on the render path, so nothing flashes the wrong
 *     layout on first paint and there is no hydration-shaped hazard;
 *   - resizing the window is instant, with no re-render.
 *
 * The cost is that both branches are in the DOM. For league-sized data — a
 * dozen teams, a few hundred cells — that is not a real cost. It would be for
 * hundreds of rows; use a virtualised table then, not this.
 *
 * @typedef {object} Column
 * @property {string} key            unique, also the React key
 * @property {React.ReactNode} header
 * @property {(row: any, index: number) => React.ReactNode} cell
 * @property {'primary'|'secondary'|'detail'} [priority]
 *   `primary` — identity. Card header, always visible. Usually 1-3 columns.
 *   `secondary` — the numbers worth scanning. Two-column grid on the card.
 *   `detail` — everything else. Behind "More" on the card.
 *   Defaults to `secondary`.
 * @property {string} [className]      applied to the <td>
 * @property {string} [headerClassName] applied to the <th>
 * @property {boolean} [sticky]       pin this column while scrolling (>= sm)
 * @property {string} [cardLabel]     label on the card when `header` is an icon
 */

/**
 * @param {object}   props
 * @param {Column[]} props.columns
 * @param {any[]}    props.data
 * @param {(row: any, index: number) => string} [props.rowKey]
 * @param {(row: any, index: number) => void}   [props.onRowClick]
 * @param {React.ReactNode} [props.empty]  shown when `data` is empty
 * @param {boolean}  [props.loading]
 */
export function ResponsiveDataTable({
  columns,
  data = [],
  rowKey = (row, i) => row?.id ?? i,
  onRowClick,
  empty = 'Nothing to show yet.',
  loading = false,
  className,
  cardClassName,
  tableClassName,
}) {
  const primary = columns.filter((c) => c.priority === 'primary')
  const secondary = columns.filter((c) => (c.priority ?? 'secondary') === 'secondary')
  const detail = columns.filter((c) => c.priority === 'detail')

  if (!loading && data.length === 0) {
    return (
      <div className={cn('py-10 text-center text-sm text-muted-foreground', className)}>
        {empty}
      </div>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      {/* ---------- Card stack: below sm ---------- */}
      <div className="space-y-2 sm:hidden">
        {data.map((row, i) => (
          <DataCard
            key={rowKey(row, i)}
            row={row}
            index={i}
            primary={primary}
            secondary={secondary}
            detail={detail}
            onClick={onRowClick}
            className={cardClassName}
          />
        ))}
      </div>

      {/* ---------- Real table: sm and up ---------- */}
      <div className="hidden sm:block">
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    c.sticky && 'sticky left-0 z-10 bg-background',
                    c.headerClassName
                  )}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      c.sticky && 'sticky left-0 z-10 bg-background',
                      c.className
                    )}
                  >
                    {c.cell(row, i)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function DataCard({ row, index, primary, secondary, detail, onClick, className }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 text-card-foreground',
        onClick && 'cursor-pointer active:bg-accent/40',
        className
      )}
      onClick={onClick ? () => onClick(row, index) : undefined}
    >
      {primary.length > 0 && (
        <div className="flex min-w-0 items-center gap-2">
          {primary.map((c) => (
            <div key={c.key} className="min-w-0 [&:nth-child(2)]:flex-1">
              {c.cell(row, index)}
            </div>
          ))}
        </div>
      )}

      {secondary.length > 0 && (
        <dl className={cn('grid grid-cols-2 gap-x-3 gap-y-1', primary.length > 0 && 'mt-2')}>
          {secondary.map((c) => (
            <div key={c.key} className="flex min-w-0 items-baseline justify-between gap-2">
              <dt className="truncate text-xs text-muted-foreground">{c.cardLabel ?? c.header}</dt>
              <dd className="shrink-0 text-sm tabular-nums">{c.cell(row, index)}</dd>
            </div>
          ))}
        </dl>
      )}

      {detail.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              // The card may itself be clickable; expanding is not selecting.
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="mt-2 flex min-h-9 w-full items-center justify-center gap-1 rounded-md text-xs text-muted-foreground hover:bg-accent/50"
          >
            {open ? 'Less' : 'More'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>

          {open && (
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2">
              {detail.map((c) => (
                <div key={c.key} className="flex min-w-0 items-baseline justify-between gap-2">
                  <dt className="truncate text-xs text-muted-foreground">
                    {c.cardLabel ?? c.header}
                  </dt>
                  <dd className="shrink-0 text-sm tabular-nums">{c.cell(row, index)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  )
}

export default ResponsiveDataTable
