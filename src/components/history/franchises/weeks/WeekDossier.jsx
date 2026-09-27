import { ArrowRightLeft, Minus, Plus, Trophy, Users } from 'lucide-react';

import { Badge } from '../../../ui/badge';
import { SectionHeading } from '../../../ui/section-heading';
import { OpponentChip } from '../../../ui/opponent-chip';
import { PlayerPoints } from '../../../ui/player-points';
import { cn } from '../../../../lib/utils';
import { getPositionColor } from '../../../../utils/positionColors';
import { EMPTY, formatDelta, formatFraction, formatOrdinal, formatPoints, formatRecord, formatScore } from '../../../../utils/format';
import { getMaskedFranchiseName } from '../../utils/privacyHelpers';
import { useNflOpponentMap } from '../../../../../hooks/queries/index.js';

/**
 * One franchise's week, as `utils/franchiseWeeks.js::buildWeekDossier` built it.
 *
 * Every part renders its own empty state, because every part is independently
 * present or absent: a week can have a result and no stored lineup (2024 week
 * 1), a lineup and no rank snapshot (anything before 2025), or nothing settled
 * yet (the week in progress). One blanket "no data" would hide what *is* known.
 *
 * Players are buttons: tapping one opens their sheet (`onPlayer`).
 */
const WeekDossier = ({ dossier, nflSeasonYear, viewer, onPlayer }) => {
  const { data: opponents = {} } = useNflOpponentMap(nflSeasonYear, dossier.week);

  return (
    <div className="space-y-4">
      <ResultHeader dossier={dossier} viewer={viewer} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Power rank" footer={dossier.power ? powerFooter(dossier.power) : 'No snapshot this week'}>
          {dossier.power ? `#${dossier.power.rank}` : EMPTY}
        </Tile>
        <Tile
          label="Standing"
          footer={dossier.standing ? `of ${dossier.standing.of}, by record${dossier.isPostseason ? ' · final regular season' : ''}` : 'No games yet'}
        >
          {dossier.standing ? formatOrdinal(dossier.standing.rank) : EMPTY}
        </Tile>
        <Tile label="Record" footer={dossier.isPostseason ? 'Regular season' : `Through ${dossier.label.toLowerCase()}`}>
          {dossier.record && (dossier.record.wins + dossier.record.losses + dossier.record.ties > 0)
            ? formatRecord(dossier.record.wins, dossier.record.losses, dossier.record.ties)
            : EMPTY}
        </Tile>
        <Tile label="Lineup efficiency" footer="Of the best lineup possible">
          {formatFraction(dossier.totals?.efficiency)}
        </Tile>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Lineup dossier={dossier} opponents={opponents} onPlayer={onPlayer} />

        <div className="space-y-4">
          <WhyRanked power={dossier.power} />
          <Moves moves={dossier.moves} viewer={viewer} />
        </div>
      </div>
    </div>
  );
};

function powerFooter(power) {
  if (power.change == null || power.change === 0) {
    return power.change === 0 ? 'No change from last week' : 'Rating ' + formatPoints(power.powerRating);
  }
  return `${power.change > 0 ? 'Up' : 'Down'} ${Math.abs(power.change)} from last week`;
}

const Tile = ({ label, footer, children }) => (
  <div className="rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] sm:p-4">
    <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 font-display text-2xl font-semibold leading-none tracking-[-0.01em] tabular">{children}</div>
    {footer && <div className="mt-1.5 text-xs leading-snug text-muted-foreground">{footer}</div>}
  </div>
);

function ResultHeader({ dossier, viewer }) {
  const { matchup } = dossier;
  const opponentName = matchup?.opponentFranchise
    ? getMaskedFranchiseName(matchup.opponentFranchise, viewer.user, viewer.isAdmin, viewer.teamOwnerNames)
    : null;

  let body;
  if (!matchup) {
    body = <p className="text-sm text-muted-foreground">No game this week.</p>;
  } else if (matchup.isBye) {
    body = <p className="text-sm text-muted-foreground">Bye — no game this week.</p>;
  } else if (!matchup.result) {
    body = (
      <p className="text-sm text-muted-foreground">
        {opponentName ? `vs ${opponentName} · ` : ''}not played yet
      </p>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="font-display text-3xl font-semibold leading-none tracking-[-0.01em] tabular">
          {formatScore(matchup.pointsFor)}
          <span className="px-2 text-muted-foreground">–</span>
          {formatScore(matchup.pointsAgainst)}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ResultBadge result={matchup.result} />
          <span
            className={cn(
              'tabular',
              matchup.margin > 0 ? 'text-success' : matchup.margin < 0 ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {formatDelta(matchup.margin, 2)}
          </span>
          {matchup.isBlowout && <Badge variant="warning">Blowout</Badge>}
          {matchup.isClose && <Badge variant="info">Close game</Badge>}
        </div>
        {opponentName && <p className="w-full text-sm text-muted-foreground">vs {opponentName}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
      <div className="mb-2 flex items-center gap-2">
        {/* A postseason week is titled by its number and badged by what the
            game was: the calendar's "Championship" is a consolation game for
            most of the league. */}
        <h3 className="text-base font-semibold">{dossier.isPostseason ? `Week ${dossier.week}` : dossier.label}</h3>
        {dossier.isPostseason && <Badge variant="outline">{dossier.phase ?? 'Postseason'}</Badge>}
      </div>
      {body}
    </div>
  );
}

const ResultBadge = ({ result }) => {
  const style = {
    W: 'border-success/20 bg-success/10 text-success',
    L: 'border-destructive/20 bg-destructive/10 text-destructive',
    T: 'border-border bg-muted text-muted-foreground'
  }[result];
  return (
    <Badge variant="outline" className={style}>
      {{ W: 'Win', L: 'Loss', T: 'Tie' }[result]}
    </Badge>
  );
};

function Lineup({ dossier, opponents, onPlayer }) {
  const { lineup, totals, matchup } = dossier;

  // The game is the score. Where a stored game result and the starters' sum
  // disagree, it is a stat correction applied to the matchup only — say so
  // rather than showing two different "totals" side by side unexplained.
  const corrected =
    totals?.starterPoints != null &&
    matchup?.pointsFor != null &&
    Math.abs(totals.starterPoints - matchup.pointsFor) > 0.01;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
      <SectionHeading as="h3" icon={Users} aside={lineup.hasLineup ? 'Tap a player' : null} className="mb-2">
        Lineup
      </SectionHeading>

      {!lineup.hasLineup ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No lineup was stored for this week.
          {matchup?.result ? ' The result above is the official score.' : ''}
        </p>
      ) : (
        <>
          <ul aria-label="Starters">
            {lineup.starters.map((row) => (
              <PlayerRow key={row.playerId} row={row} opponent={opponents[row.proTeamId]} onPlayer={onPlayer} />
            ))}
          </ul>

          {lineup.bench.length > 0 && (
            <>
              <h4 className="mb-1 mt-4 text-sm font-semibold">Bench</h4>
              <ul aria-label="Bench" className="text-muted-foreground">
                {lineup.bench.map((row) => (
                  <PlayerRow key={row.playerId} row={row} opponent={opponents[row.proTeamId]} onPlayer={onPlayer} bench />
                ))}
              </ul>
            </>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center sm:grid-cols-4">
            <Total label="Starters" value={formatPoints(totals?.starterPoints)} />
            <Total label="Best possible" value={formatPoints(totals?.optimalPoints)} />
            <Total label="Left on bench" value={formatPoints(totals?.benchPoints)} />
            <Total label="Efficiency" value={formatFraction(totals?.efficiency)} />
          </dl>
          {corrected && (
            <p className="mt-2 text-xs text-muted-foreground">
              The game score ({formatScore(matchup.pointsFor)}) includes a stat correction ESPN applied to the matchup but not to player lines.
            </p>
          )}
        </>
      )}
    </section>
  );
}

const Total = ({ label, value }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="font-display text-lg leading-tight tabular">{value}</dd>
  </div>
);

function PlayerRow({ row, opponent, onPlayer, bench = false }) {
  const rank = row.rank;
  return (
    <li className="border-b border-border/60 last:border-0">
      <button
        type="button"
        onClick={() => onPlayer?.(row)}
        className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:gap-3 pointer-coarse:py-3"
      >
        <span
          className={cn(
            'inline-flex w-11 shrink-0 justify-center rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
            getPositionColor(bench ? row.position : row.slot)
          )}
        >
          {bench ? row.slot === 'IR' ? 'IR' : 'BE' : row.slot}
        </span>
        <span className={cn('min-w-0 flex-1 truncate', !bench && 'font-medium text-foreground')}>{row.name ?? 'Unknown player'}</span>
        <span className="hidden w-10 shrink-0 text-right text-xs text-muted-foreground sm:inline">{row.proTeam ?? ''}</span>
        <span className="hidden w-14 shrink-0 text-right sm:inline-block">
          <OpponentChip entry={opponent} />
        </span>
        {row.touchdowns > 0 && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-success">
            {row.touchdowns} TD
          </span>
        )}
        {rank && (
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular" title={`#${rank.overall} overall that week`}>
            {row.position}{rank.positional}
          </span>
        )}
        <PlayerPoints actualPoints={row.actualPoints} className="w-12 shrink-0 text-right" />
      </button>
    </li>
  );
}

function WhyRanked({ power }) {
  if (!power) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
      <SectionHeading
        as="h3"
        icon={Trophy}
        aside={power.powerRating != null ? <span className="font-display text-lg text-foreground tabular">{formatPoints(power.powerRating)}</span> : null}
        className="mb-3"
      >
        Why #{power.rank}
      </SectionHeading>
      {power.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No component breakdown was stored for this week.</p>
      ) : power.legacy ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">An older ranking formula, shown under its own names.</p>
          <dl className="space-y-1 text-sm">
            {power.items.map((item) => (
              <div key={item.key} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="tabular">{formatPoints(item.value)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <ul className="space-y-2">
          {power.items.map((item) => (
            <li key={item.key} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-xs" title={item.description}>
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />
              </span>
              <span className="text-right tabular">{Math.round(item.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MOVE_LABEL = { trade: 'Trade', waiver: 'Waiver claim', free_agent: 'Free agent' };

function Moves({ moves, viewer }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
      <SectionHeading as="h3" icon={ArrowRightLeft} className="mb-3">
        Moves this week
      </SectionHeading>
      {moves.length === 0 ? (
        <p className="text-sm text-muted-foreground">No adds, claims or trades this week.</p>
      ) : (
        <ul className="space-y-3">
          {moves.map((move) => (
            <li key={move.id} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {MOVE_LABEL[move.kind]}
                  {move.kind === 'trade' && move.counterparts.length > 0 && (
                    <span className="font-normal text-muted-foreground">
                      {' '}with {move.counterparts
                        .map((f) => getMaskedFranchiseName(f, viewer.user, viewer.isAdmin, viewer.teamOwnerNames))
                        .join(', ')}
                    </span>
                  )}
                </span>
                {move.bidAmount != null && <span className="text-xs text-muted-foreground tabular">${move.bidAmount} FAAB</span>}
              </div>
              <ul className="mt-1 space-y-0.5">
                {move.added.map((p) => (
                  <MovePlayer key={`a${p.espnPlayerId}`} icon={Plus} tone="text-success" player={p} />
                ))}
                {move.dropped.map((p) => (
                  <MovePlayer key={`d${p.espnPlayerId}`} icon={Minus} tone="text-destructive" player={p} />
                ))}
                {move.involved.map((p) => (
                  <MovePlayer key={`i${p.espnPlayerId}`} player={p} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MovePlayer = ({ icon: Icon, tone, player }) => (
  <li className="flex items-center gap-1.5 text-muted-foreground">
    {Icon ? <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} aria-hidden="true" /> : <span className="w-3.5" />}
    <span className="sr-only">{Icon === Plus ? 'Added' : Icon === Minus ? 'Dropped' : 'Moved'}</span>
    <span className="truncate text-foreground">{player.name ?? `Player ${player.espnPlayerId}`}</span>
    {player.position && <span className="text-xs">{player.position}</span>}
  </li>
);

export default WeekDossier;
