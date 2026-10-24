import { formatRecord, formatScore } from '../../../utils/format';

/**
 * Who a row is and the one line of context under the name.
 *
 * `identity` does the masking — franchise names, team names and avatars all
 * come through it — so nothing here can print an owner a signed-out viewer
 * should not see.
 */
export function describeRow(record, row, identity) {
  const franchise = identity.franchiseName(row.franchiseId);

  switch (record.kind) {
    case 'franchise': {
      const parts = [];
      if (record.detail === 'record' && row.record) parts.push(formatRecord(row.record));
      if (row.seasons) parts.push(`${row.seasons} ${row.seasons === 1 ? 'season' : 'seasons'}`);
      return { name: franchise, meta: parts.join(' · ') };
    }
    case 'teamSeason': {
      const parts = [identity.teamName(row.teamId), row.year];
      if (record.detail === 'record' && row.record) parts.push(formatRecord(row.record));
      return { name: franchise, meta: parts.filter(Boolean).join(' · ') };
    }
    case 'game': {
      const [pf, pa] = row.score ?? [];
      return {
        name: franchise,
        meta: `${formatScore(pf)}–${formatScore(pa)} vs ${identity.franchiseName(row.opponentFranchiseId)} · Wk ${row.week}, ${row.year}`
      };
    }
    case 'streak': {
      const { start, end } = row;
      const span = start.year === end.year
        ? `${start.year} · wk ${start.week}–${end.week}`
        : `${start.year} wk ${start.week} – ${end.year} wk ${end.week}`;
      return { name: franchise, meta: span, active: row.active };
    }
    case 'seasonStreak':
      return { name: franchise, meta: `${row.startYear}–${row.endYear}`, active: row.active };
    case 'pair':
      return {
        name: `${franchise} & ${identity.franchiseName(row.partnerFranchiseId)}`,
        meta: row.year ? String(row.year) : null
      };
    case 'bid':
      return {
        name: franchise,
        meta: [row.playerName ?? 'Unknown player', row.week ? `Wk ${row.week}, ${row.year}` : row.year]
          .filter(Boolean)
          .join(' · ')
      };
    // The league as one team: the row is a week or a season, not a franchise.
    case 'leagueWeek': {
      let meta = null;
      if (row.franchiseIds?.length) meta = row.franchiseIds.map((id) => identity.franchiseName(id)).join(' & ');
      else if (row.average != null) meta = `${formatScore(row.average)} per team`;
      return { name: `Week ${row.week}, ${row.year}`, meta };
    }
    case 'leagueSeason':
      return { name: String(row.year), meta: `${row.weeks} weeks · ${row.games} games` };
    default:
      return { name: franchise, meta: null };
  }
}

export default describeRow;
