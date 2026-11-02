import { getTeamColor } from '../../utils/teamColors'

/**
 * The field behind a scoreboard: each side washed in its franchise colour,
 * brightest at the outer edge and gone by the centre, over faint yard lines
 * every tenth with a brighter midfield. The one decorative element a page gets,
 * in the one place that is a field. Inline gradients over the team's
 * `var(--team-N)`, so no class names are built at runtime.
 */
export function FieldBackdrop({ left, right }) {
  const wash = (team, direction) =>
    team
      ? `linear-gradient(${direction}, color-mix(in oklab, ${getTeamColor(team).value} 16%, transparent), transparent 48%)`
      : 'none'

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ backgroundImage: `${wash(left, '90deg')}, ${wash(right, '270deg')}` }} />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(90deg, transparent calc(50% - 1px), color-mix(in oklab, var(--foreground) 14%, transparent) calc(50% - 1px), color-mix(in oklab, var(--foreground) 14%, transparent) calc(50% + 1px), transparent calc(50% + 1px)), repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), var(--border) calc(10% - 1px), var(--border) 10%)',
          maskImage: 'linear-gradient(180deg, transparent, black 25%, black 75%, transparent)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent, black 25%, black 75%, transparent)'
        }}
      />
    </div>
  )
}

/**
 * Two figures as one bar: the left side's share of the whole, in each side's
 * franchise colour. A tug of war, not a probability. It says who is ahead and
 * by how much at a glance, and the line under it says it in words.
 */
export function ShareBar({ share, left, right }) {
  if (share == null) return <div className="mt-4 h-1.5 rounded-full bg-muted" aria-hidden="true" />
  return (
    <div className="mt-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      <div
        className="h-full rounded-l-full transition-[width] duration-700 ease-out"
        style={{ width: `${share}%`, background: left ? getTeamColor(left).value : 'var(--muted)' }}
      />
      <div
        className="h-full flex-1 rounded-r-full opacity-70"
        style={{ background: right ? getTeamColor(right).value : 'var(--muted)' }}
      />
    </div>
  )
}
