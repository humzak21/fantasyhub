import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from 'lucide-react'


import { cn } from '../../lib/utils'
import { ariaSortOf, nextSort } from '../../utils/tableSort'
import { Button } from './button'
import { CHEVRON_GUTTER, ScrollTable } from './scroll-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'
import { ROW_TONE, STICKY_CELL, STICKY_HEAD, VIEWER_RAIL } from './table-tones'

/** Stat blocks per row in a card: as many as there are, up to four. */
const STAT_GRID = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

/**
 * One column definition, two layouts.
 *
 * A table with eleven columns does not become usable on a 375px screen by
 * squeezing it, so below `md` it takes a different *shape* for the same data,
 * and there are two to choose from:
 *
 *   - **Cards**, the default, for a list a reader takes one item at a time: the
 *     identifying columns become the card's header, the numbers people actually
 *     scan become a small grid, and the long tail folds away behind a
 *     disclosure.
 *   - **`scroll`**, for a table a reader compares down: every item keeps one
 *     row, so vertical space goes on seeing the whole list, and the details are
 *     a swipe to the right. A leading column stays pinned, so the row is not
 *     lost as the rest moves. A league table is this shape: on cards a 375px
 *     screen held one team and a third of the next.
 *
 * The switch is at `md` (768px), not `sm`. Two "mobile" widths used to coexist
 * in this codebase — `useIsMobile()` and `useMobileAxis()` break at 768 while
 * every responsive class broke at 640 — so a landscape phone at 700px got the
 * card-stack's sibling behaviour from one and the desktop's from the other.
 * 768 is now the one structural boundary: table vs cards, drawer vs dialog,
 * tab bar vs header nav. It also happens to be the better line for this
 * component, since 640-767px is a phone in landscape, which reads a card
 * stack far more comfortably than a nine-column table.
 *
 * Both branches are rendered and CSS-switched (`md:hidden` / `hidden md:block`)
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
 * @property {boolean} [sticky]       pin this column while scrolling (>= md)
 * @property {string} [cardLabel]     label on the card when `header` is an icon
 * @property {string} [cardClassName] applied to the stat block on the card,
 *   e.g. `col-span-2` for a value that needs more than one grid cell
 * @property {(row: any) => any} [sortValue] what this column sorts by. Having
 *   one is what makes the column sortable, once the table has `onSortChange`.
 * @property {ScrollColumn} [scroll] how this column sits in the `scroll` layout
 *
 * @typedef {object} ScrollColumn
 * @property {number} [width]    in rem, 4 by default. A number, because the
 *   table's width is the sum of them.
 * @property {boolean} [pin]     the leading column, held in place
 * @property {string} [fluid]    the name column: it takes what the card has
 *   left after the `pin` and `shown` columns, never less than this CSS length
 *   (`'13ch + 0.75rem'`). So the default view lands on exactly those columns.
 * @property {boolean} [shown]   in the default view; the rest are to the right
 * @property {boolean} [only]    in this layout alone: a detail the wide layout
 *   carries some other way
 * @property {React.ReactNode} [header]  a shorter header than the wide layout's
 * @property {string} [title]    what a shortened header stands for
 * @property {(row: any, index: number) => React.ReactNode} [cell]  a smaller
 *   cell than the wide layout's. One line: a row that wraps stops being a row.
 * @property {string} [className]  applied to the <th> and the <td>
 *
 * @typedef {object} ScrollLayout
 * @property {string} label        names the scrolling region
 * @property {string[]} [order]    reading order, by key. Unlisted columns follow.
 * @property {(row: any, index: number) => string} [tone]  the row's background,
 *   from `ROW_TONE`: it has to be opaque, or the columns scrolled under the
 *   pinned one show through. `ROW_TONE.base` by default.
 * @property {(row: any, index: number) => boolean} [isViewer]  the viewer's own
 *   row, which takes the viewer's tone and rail over `tone`
 */

/**
 * @param {object}   props
 * @param {Column[]} props.columns
 * @param {any[]}    props.data
 * @param {(row: any, index: number) => string} [props.rowKey]
 * @param {(row: any, index: number) => void}   [props.onRowClick]
 * @param {React.ReactNode} [props.empty]  shown when `data` is empty
 * @param {boolean}  [props.loading]
 * @param {(row: any, index: number) => string} [props.rowClassName]
 *   Per-row classes, applied to the table row *and* to the card, so
 *   row-level emphasis — highlighting the viewer's own team, say — survives
 *   the switch between layouts.
 * @param {{ key: string, direction: 'asc'|'desc' }|null} [props.sort]
 *   The current order, `null` for the default. The caller owns it and passes
 *   `data` already sorted (`sortRows` in `src/utils/tableSort.js`).
 * @param {(sort: object|null) => void} [props.onSortChange]
 *   Makes every column with a `sortValue` sortable: a button in its header
 *   that cycles default → descending → ascending, and, because a card stack
 *   has no headers, a compact control above the cards.
 * @param {ScrollLayout} [props.scroll]
 *   Below `md`, one row per item in a table wider than the screen, in place of
 *   the cards.
 */
export function ResponsiveDataTable({
  columns,
  data = [],
  rowKey = (row, i) => row?.id ?? i,
  rowClassName,
  onRowClick,
  empty = 'Nothing to show yet.',
  loading = false,
  className,
  cardClassName,
  tableClassName,
  sort = null,
  onSortChange,
  scroll,
}) {
  const sortable = onSortChange ? columns.filter((c) => c.sortValue) : []
  const wideColumns = columns.filter((c) => !c.scroll?.only)
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
      {/* ---------- Cards, or one row each: below md ---------- */}
      <div data-layout={scroll ? 'scroll' : 'cards'} className="space-y-2 md:hidden">
        {sortable.length > 0 && (
          <SortControl columns={sortable} sort={sort} onSortChange={onSortChange} />
        )}
        {scroll ? (
          <ScrollRows
            columns={columns}
            data={data}
            rowKey={rowKey}
            onRowClick={onRowClick}
            scroll={scroll}
          />
        ) : (
          data.map((row, i) => (
            <DataCard
              key={rowKey(row, i)}
              row={row}
              index={i}
              primary={primary}
              secondary={secondary}
              detail={detail}
              onClick={onRowClick}
              className={cn(cardClassName, rowClassName?.(row, i))}
            />
          ))
        )}
      </div>

      {/* ---------- Real table: md and up ----------
          Contained. A bare <table> on the page background is a grid drawn on
          the ground; the same table inside a bordered, rounded surface is an
          object with edges, which is what lets the header strip and the row
          dividers read as structure rather than as more lines. */}
      <div data-layout="wide" className={cn('hidden md:block', TABLE_SURFACE)}>
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              {wideColumns.map((c) => {
                const canSort = onSortChange && c.sortValue
                return (
                  <TableHead
                    key={c.key}
                    aria-sort={canSort ? ariaSortOf(sort, c.key) : undefined}
                    className={cn(
                      c.sticky && 'sticky left-0 z-10 bg-muted',
                      c.headerClassName
                    )}
                  >
                    {canSort ? (
                      <SortHeader column={c} sort={sort} onSortChange={onSortChange} />
                    ) : (
                      c.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row, i))}
              >
                {wideColumns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      c.sticky && 'sticky left-0 z-10 bg-card',
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

const TABLE_SURFACE =
  'overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]'

const DEFAULT_SCROLL_WIDTH = 4
const scrollWidthOf = (c) => c.scroll?.width ?? DEFAULT_SCROLL_WIDTH
const remsOf = (columns) => columns.reduce((sum, c) => sum + scrollWidthOf(c), 0)

/** Columns in reading order: the listed ones first, then the rest as declared. */
function inScrollOrder(columns, order = []) {
  const place = (c) => {
    const index = order.indexOf(c.key)
    return index === -1 ? order.length : index
  }
  return [...columns].sort((a, b) => place(a) - place(b))
}

/**
 * The `scroll` layout: one row per item, wider than the screen.
 *
 * The widths are numbers rather than classes so the table's width can be worked
 * out from them and cannot drift from its columns. `cqw` is the viewport's width
 * (`ScrollTable` is a container), so the fluid column is what lands the default
 * view on the columns it should, at any phone width.
 */
function ScrollRows({ columns, data, rowKey, onRowClick, scroll }) {
  const ordered = inScrollOrder(columns, scroll.order)
  const fluid = ordered.find((c) => c.scroll?.fluid)
  const fixed = ordered.filter((c) => c !== fluid)
  const inView = fixed.filter((c) => c.scroll?.pin || c.scroll?.shown)

  const fluidWidth = fluid && `max(${fluid.scroll.fluid}, 100cqw - ${remsOf(inView) + CHEVRON_GUTTER}rem)`
  const tableWidth = fluid ? `calc(${fluidWidth} + ${remsOf(fixed)}rem)` : `${remsOf(fixed)}rem`

  return (
    <ScrollTable label={scroll.label} className={TABLE_SURFACE}>
      <table
        className="table-fixed border-separate border-spacing-0 text-[13px]"
        style={{ width: tableWidth }}
      >
        <colgroup>
          {ordered.map((c) => (
            <col key={c.key} style={{ width: c === fluid ? fluidWidth : `${scrollWidthOf(c)}rem` }} />
          ))}
        </colgroup>
        <thead className="text-xs text-muted-foreground">
          <tr>
            {ordered.map((c) => (
              <th
                key={c.key}
                scope="col"
                title={c.scroll?.title}
                className={cn(
                  STICKY_HEAD,
                  'whitespace-nowrap border-b border-border/60 px-1.5 py-1.5 text-left font-medium',
                  c.scroll?.pin && 'left-0 z-[3] border-r pl-2',
                  c.scroll?.className
                )}
              >
                {c.scroll?.header ?? c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const isViewer = Boolean(scroll.isViewer?.(row, i))
            const tone = isViewer ? ROW_TONE.viewer : (scroll.tone?.(row, i) ?? ROW_TONE.base)
            return (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                className={cn('group', onRowClick && 'cursor-pointer', tone)}
              >
                {ordered.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'h-10 whitespace-nowrap border-b border-border/40 px-1.5 group-last:border-0',
                      c.scroll?.pin && [STICKY_CELL, 'left-0 pl-2 pr-1', isViewer && VIEWER_RAIL],
                      c.scroll?.className
                    )}
                  >
                    {(c.scroll?.cell ?? c.cell)(row, i)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollTable>
  )
}

/**
 * A column header that sorts. The icon is the state: a faint up-down pair at
 * rest, one arrow while the column holds the sort.
 */
function SortHeader({ column, sort, onSortChange }) {
  const active = sort?.key === column.key
  const Icon = !active
    ? ChevronsUpDown
    : sort.direction === 'asc'
      ? ArrowUp
      : ArrowDown

  return (
    <button
      type="button"
      onClick={() => onSortChange(nextSort(sort, column.key))}
      className={cn(
        '-mx-1 inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-9',
        active && 'text-foreground'
      )}
    >
      {column.header}
      <Icon
        className={cn('h-3.5 w-3.5 shrink-0', !active && 'opacity-50')}
        aria-hidden="true"
      />
    </button>
  )
}

const DEFAULT_SORT = 'default'

/**
 * The card stack's stand-in for its missing headers: which column, and which
 * way. Choosing a column starts it descending, the way a first press of its
 * header does, and "Default" puts the table's own order back.
 */
function SortControl({ columns, sort, onSortChange }) {
  const active = columns.find((c) => c.key === sort?.key)
  const ascending = sort?.direction === 'asc'

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
        Sort by
      </span>
      <Select
        value={active?.key ?? DEFAULT_SORT}
        onValueChange={(key) =>
          onSortChange(key === DEFAULT_SORT ? null : { key, direction: 'desc' })
        }
      >
        <SelectTrigger aria-label="Sort by" className="h-9 min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SORT}>Default</SelectItem>
          {columns.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              {c.cardLabel ?? c.header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!active}
        aria-label={ascending ? 'Sorted ascending. Sort descending' : 'Sorted descending. Sort ascending'}
        onClick={() =>
          onSortChange({ key: active.key, direction: ascending ? 'desc' : 'asc' })
        }
        className="h-9 w-9 shrink-0"
      >
        {ascending ? (
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}

function DataCard({ row, index, primary, secondary, detail, onClick, className }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-3.5 text-card-foreground',
        'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
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

      {/*
        Stat blocks — label above value — rather than `label: value` rows.
        Side by side, the label and the number are the same size on the same
        line and compete; stacked, the eye lands on a row of values and the
        labels stay available underneath. It is also denser: three fit across a
        375px card where two `label: value` pairs did, and nothing truncates.
      */}
      {secondary.length > 0 && (
        <dl
          className={cn(
            'grid gap-x-3 gap-y-2.5',
            // Four stats fit four across at 375px; three is what used to
            // leave a lone "Playoffs" on its own row under every franchise.
            STAT_GRID[Math.min(secondary.length, 4)],
            primary.length > 0 && 'mt-3.5 border-t border-border/60 pt-3'
          )}
        >
          {secondary.map((c) => (
            <div key={c.key} className={cn('min-w-0', c.cardClassName)}>
              <dt className="truncate text-xs font-medium text-muted-foreground">
                {c.cardLabel ?? c.header}
              </dt>
              <dd className="mt-0.5 truncate text-[13px] font-medium tabular">
                {c.cell(row, index)}
              </dd>
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
            className="mt-3 flex min-h-9 w-full items-center justify-center gap-1 rounded-md border border-border/60 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50"
          >
            {open ? 'Less' : 'More'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>

          {open && (
            <dl className={cn('mt-1 grid gap-x-3 gap-y-2.5 border-t border-border/60 pt-3', STAT_GRID[Math.min(detail.length, 4)])}>
              {detail.map((c) => (
                <div key={c.key} className={cn('min-w-0', c.cardClassName)}>
                  <dt className="truncate text-xs font-medium text-muted-foreground">
                    {c.cardLabel ?? c.header}
                  </dt>
                  <dd className="mt-0.5 truncate text-[13px] font-medium tabular">
                    {c.cell(row, index)}
                  </dd>
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
