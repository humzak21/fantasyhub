import { Sigma } from 'lucide-react';

import { EMPTY, formatFraction, formatPoints } from '../../../utils/format';
import { SectionCard, SectionEmpty } from './SectionCard.jsx';
import { formatCount, plural } from './sectionFormat.js';

function derivedValue(d) {
  return d.format === 'fraction' ? formatFraction(d.value) : formatPoints(d.value);
}

function PointsSummary({ totals }) {
  const items = [
    ['Total points', formatPoints(totals.totalPoints)],
    ['Per game', formatPoints(totals.pointsPerGame)],
    ['As a starter', formatPoints(totals.startedPoints)],
    ['On the bench', formatPoints(totals.benchPoints)],
    ['Avg. position rank', totals.avgPositionRank != null ? formatPoints(totals.avgPositionRank) : EMPTY],
    ['Top-5 weeks', totals.top5Finishes ?? EMPTY]
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @md:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="truncate text-[13px] text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium text-foreground tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GroupTable({ group }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
        <span className="text-xs text-muted-foreground tabular">{plural(group.games, 'game')} with a stat line</span>
      </div>
      <table className="w-full table-fixed text-[13px]">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th scope="col" className="py-1 text-left font-medium">Stat</th>
            <th scope="col" className="w-20 py-1 text-right font-medium">Total</th>
            <th scope="col" className="w-20 py-1 text-right font-medium">Per game</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.id} className="border-b border-border/40 last:border-0">
              <th scope="row" className="truncate py-1.5 text-left font-normal text-foreground">{row.label}</th>
              <td className="py-1.5 text-right tabular text-foreground">{formatCount(row.total)}</td>
              <td className="py-1.5 text-right tabular text-muted-foreground">{formatPoints(row.perGame)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {group.derived.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {group.derived.map((d) => (
            <li key={d.id} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {d.label} <span className="font-semibold text-foreground tabular">{derivedValue(d)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The span's points, then each stat group summed: total and per game, with
 * the ratios computed from the sums. A group with nothing in it is not shown
 * (the catalog's rule).
 */
export default function TotalsAndAverages({ profile, season }) {
  const totals = season?.totals ?? profile.career ?? {};
  const groups = season?.byGroup ?? profile.career?.byGroup ?? [];
  return (
    <SectionCard title="Totals & averages" icon={Sigma}>
      <PointsSummary totals={totals} />
      {groups.length === 0 ? (
        <SectionEmpty>No stat lines for this span</SectionEmpty>
      ) : (
        <div className="grid gap-4 @2xl:grid-cols-2">
          {groups.map((group) => <GroupTable key={group.group} group={group} />)}
        </div>
      )}
    </SectionCard>
  );
}
