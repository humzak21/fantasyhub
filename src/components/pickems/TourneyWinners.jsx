import { useAllSeasonPicks } from '../../../hooks/queries/index.js';
import { WinnersStrip } from './PreviousWeekWinners.jsx';
import { announcedTourney, tourneyStandingsFromPicks, tourneyWinners } from './tourneys.js';

/**
 * The weeks 1-8 tourney's winner, one line under the week's winners, shown in
 * week 9 only (`announcedTourney`).
 *
 * The winner is `tourneyWinners`' answer, the one the winners' push names:
 * the top score among members over the tourney's participation floor, every
 * one of them on a tie. It reads the season's picks on the Standings tab's own
 * query key, so it costs nothing the page was not already fetching.
 *
 * @param {object} props
 * @param {string|null} props.seasonId
 * @param {number} props.viewedWeek
 * @param {number|null} props.finishedWeek - the newest fully scored week
 */
export default function TourneyWinners({ seasonId, viewedWeek, finishedWeek }) {
  const tourney = announcedTourney({ finishedWeek, viewedWeek });
  const { data: picks } = useAllSeasonPicks(seasonId, { enabled: Boolean(tourney) });

  if (!tourney || !picks) return null;

  const winners = tourneyWinners(tourneyStandingsFromPicks(tourney, picks));
  if (winners.length === 0) return null;

  const span = `${tourney.startWeek}-${tourney.endWeek}`;
  const noun = winners.length > 1 ? 'Winners' : 'Winner';
  return (
    <WinnersStrip
      label={`Week ${span} Tournament ${noun}:`}
      ariaLabel={`Week ${span} pick'em tournament ${noun.toLowerCase()}`}
      winners={winners}
    />
  );
}
