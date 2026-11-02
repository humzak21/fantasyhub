import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

import { cn } from '../../lib/utils'
import { ariaSortOf, nextSort } from '../../utils/tableSort'
import { Button } from './button'
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

/**
 * One column definition, two layouts.
 *
 * A table with eleven columns does not become usable on a 375px screen by
 * scrolling — the reader loses the row they were on the moment the first
 * column leaves the viewport. The card stack below `md` is a different *shape*
 * for the same data: the identifying columns become the card's header, the
 * numbers people actually scan become a small grid, and the long tail folds
 * away behind a disclosure.
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
}) {
  const sortable = onSortChange ? columns.filter((c) => c.sortValue) : []
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
      {/* ---------- Card stack: below md ---------- */}
      <div className="space-y-2 md:hidden">
        {sortable.length > 0 && (
          <SortControl columns={sortable} sort={sort} onSortChange={onSortChange} />
        )}
        {data.map((row, i) => (
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
        ))}
      </div>

      {/* ---------- Real table: md and up ----------
          Contained. A bare <table> on the page background is a grid drawn on
          the ground; the same table inside a bordered, rounded surface is an
          object with edges, which is what lets the header strip and the row
          dividers read as structure rather than as more lines. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] md:block">
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              {columns.map((c) => {
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
                {columns.map((c) => (
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
            'grid grid-cols-3 gap-x-3 gap-y-2.5 xs:grid-cols-4',
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
            <dl className="mt-1 grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-border/60 pt-3 xs:grid-cols-4">
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
