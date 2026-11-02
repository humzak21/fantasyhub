/**
 * The one matchup card, on Make Picks, Results and the home panel.
 *
 * What it must keep from the two lists it replaced: each side is still a real
 * radio, a team with no synced roster says so rather than reading as starting
 * nobody, the bench stays out of a total, and an unknown opponent renders
 * nothing. What it adds: a side's number is labelled for the claim it makes, a
 * finished game stays on the page locked, and the viewer's chip and the league's
 * split sit under the pair.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { GAME_STATE } from '../../../../services/espnLiveScoreMapper.js';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

const { MatchupPickCard } = await import('../MatchupPickCard.jsx');

const TEAM_1 = { id: 't1', name: 'Team One', owner: 'Arya Shah', wins: 5, losses: 2, ties: 0 };
const TEAM_2 = { id: 't2', name: 'Team Two', owner: 'Rohit Ramki', wins: 3, losses: 4, ties: 0 };

const GAME = { id: 'g1', isCompleted: false, team1: TEAM_1, team2: TEAM_2, team1Id: 't1', team2Id: 't2' };
const BYE = { id: 'g2', isCompleted: false, type: 'bye', team1: TEAM_1, team2: null };

const row = (id, teamId, overrides) => ({
  id,
  teamId,
  rosterSlot: 'WR',
  started: true,
  proTeamId: 12,
  actualPoints: null,
  projectedPoints: 15,
  player: { name: `Player ${id}`, position: 'WR' },
  ...overrides
});

const ROWS = {
  t1: [
    row('r1', 't1', { rosterSlot: 'QB', projectedPoints: 21.4, player: { name: 'Josh Allen', position: 'QB' } }),
    row('r2', 't1', { rosterSlot: 'BE', started: false, projectedPoints: 9, player: { name: 'A Benchwarmer', position: 'RB' } }),
    row('r3', 't1', { rosterSlot: 'IR', started: false, player: { name: 'An Injured Guy', position: 'TE' } })
  ],
  t2: [row('r4', 't2', { player: { name: 'Justin Jefferson', position: 'WR' } })]
};

const board = (overrides) => ({
  rowsByTeam: ROWS,
  live: null,
  opponents: {},
  outlooks: {},
  isLoading: false,
  ...overrides
});

const VIEWER = { user: { id: 'u1', user_metadata: { name: 'Arya Shah' } }, isAdmin: true, teamOwnerNames: [] };

const renderCard = (props = {}) => {
  const onPick = vi.fn();
  render(
    <MemoryRouter>
      <MatchupPickCard
        game={GAME}
        number={3}
        selectedTeamId={null}
        canPick
        onPick={onPick}
        board={board()}
        viewer={VIEWER}
        {...props}
      />
    </MemoryRouter>
  );
  return { onPick };
};

const side = (name) => screen.getByRole('radio', { name: new RegExp(name) });

describe('MatchupPickCard, as a choice', () => {
  it('makes each side a radio carrying its owner and record', () => {
    renderCard();

    expect(screen.getByRole('radiogroup', { name: 'Pick the winner of game 3' })).toBeInTheDocument();
    expect(side('Team One')).toHaveTextContent('Arya Shah');
    expect(side('Team One')).toHaveTextContent('5–2');
    expect(side('Team Two')).toHaveTextContent('3–4');
  });

  it('picks a team', async () => {
    const { onPick } = renderCard();

    await userEvent.click(side('Team Two'));

    expect(onPick).toHaveBeenCalledWith('t2');
  });

  it('shows the pick, and takes no clicks when picks are closed', async () => {
    const { onPick } = renderCard({ selectedTeamId: 't1', canPick: false });

    expect(side('Team One')).toBeChecked();
    expect(side('Team Two')).toBeDisabled();
    await userEvent.click(side('Team Two'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('keeps a finished game on the page, locked, with the W on its winner', () => {
    renderCard({
      game: { ...GAME, isCompleted: true, winnerTeamId: 't2', team1Score: 99.4, team2Score: 121.2 }
    });

    expect(side('Team One')).toBeDisabled();
    expect(side('Team Two')).toBeDisabled();
    expect(side('Team Two')).toHaveTextContent('Won.');
    expect(side('Team One')).not.toHaveTextContent('Won.');
  });

  it('marks a bye and offers no second side', () => {
    renderCard({ game: BYE });

    expect(screen.getByText('BYE')).toBeInTheDocument();
    expect(screen.getByText('On bye')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});

describe('MatchupPickCard, the score', () => {
  it('labels a projection before kickoff, and leaves the bench out of it', () => {
    renderCard();

    expect(side('Team One')).toHaveTextContent('proj');
    expect(side('Team One')).toHaveTextContent('21.4');
  });

  it('shows the score so far as live, with what is left', () => {
    const rows = {
      t1: [
        row('a', 't1', { actualPoints: 18.5, nflState: GAME_STATE.IN_PROGRESS }),
        row('b', 't1', { nflState: GAME_STATE.NOT_STARTED })
      ],
      t2: ROWS.t2
    };
    const live = { games: { g1: { team1: { points: 18.5, projected: 118.2 }, team2: { points: 0, projected: 96 } } } };

    renderCard({ board: board({ rowsByTeam: rows, live }) });

    expect(side('Team One')).toHaveTextContent('live');
    expect(side('Team One')).toHaveTextContent('18.5');
    expect(side('Team One')).toHaveTextContent('1 yet to play · proj 118.2');
    expect(side('Team One')).not.toHaveTextContent('proj18');
  });

  it('lets an imported score win over everything', () => {
    renderCard({ game: { ...GAME, isCompleted: true, winnerTeamId: 't1', team1Score: 121.2, team2Score: 99.4 } });

    expect(side('Team One')).toHaveTextContent('121.2');
    expect(side('Team One')).not.toHaveTextContent('proj');
  });

  it('draws no figure, and no block inside a button, while the lineups load', () => {
    renderCard({ board: board({ isLoading: true }) });

    expect(side('Team One')).not.toHaveTextContent('proj');
    expect(side('Team One').querySelector('div, p')).toBeNull();
  });
});

describe('MatchupPickCard, under the pair', () => {
  it('shows the viewer\'s chip and its reason', () => {
    const outlooks = { g1: { key: 'inDanger', label: 'In danger', variant: 'warning', detail: 'needs 18.4 from 2 players', probability: 0.3 } };
    renderCard({ board: board({ outlooks }), selectedTeamId: 't1' });

    expect(screen.getByText('In danger')).toBeInTheDocument();
    expect(screen.getByText('needs 18.4 from 2 players')).toBeInTheDocument();
  });

  it('draws no chip without one', () => {
    renderCard();
    expect(screen.queryByText('Your pick:')).not.toBeInTheDocument();
  });

  const split = (first, second) => ({
    gameId: 'g1',
    sides: [
      { team: TEAM_1, share: first, trails: first < second },
      { team: TEAM_2, share: second, trails: second < first }
    ]
  });

  it('shows how the league picked', () => {
    renderCard({ split: split(75, 25) });

    expect(screen.getByText("League's picks")).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('draws nothing for a game nobody picked, never 0%', () => {
    renderCard({ split: split(null, null) });
    expect(screen.queryByText("League's picks")).not.toBeInTheDocument();
  });

  it('names each share for a screen reader the way the viewer may see it', () => {
    const masked = { user: null, isAdmin: false, teamOwnerNames: [] };
    renderCard({ split: split(75, 25), viewer: masked });

    expect(screen.getByText(`${getMaskedTeamName(TEAM_1, null, false, [])}:`)).toBeInTheDocument();
    expect(screen.queryByText('Team One:')).not.toBeInTheDocument();
  });
});

describe('MatchupPickCard, the lineups', () => {
  const open = () => userEvent.click(screen.getByRole('button', { name: 'Lineups' }));

  it('stays closed until asked', () => {
    renderCard();
    expect(screen.queryByText('Josh Allen')).not.toBeInTheDocument();
  });

  it('lists the whole roster, starters above the bench and IR', async () => {
    renderCard();
    await open();

    const groups = ['Starters', 'Bench', 'Injured reserve'].map((label) => screen.getAllByRole('heading', { name: label })[0]);
    expect(groups[0].compareDocumentPosition(groups[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(groups[1].compareDocumentPosition(groups[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('A Benchwarmer')).toBeInTheDocument();
    expect(screen.getByText('An Injured Guy')).toBeInTheDocument();
  });

  it('keeps a starter with no projection rather than dropping them', async () => {
    const rows = { t1: [row('x', 't1', { projectedPoints: null, player: { name: 'No Figure', position: 'WR' } })], t2: [] };
    renderCard({ board: board({ rowsByTeam: rows }) });
    await open();

    expect(within(screen.getByText('No Figure').closest('li')).getByText('—')).toBeInTheDocument();
  });

  it('says so when no roster has been synced', async () => {
    renderCard({ board: board({ rowsByTeam: {} }) });
    await open();

    expect(screen.getByText('No roster has been synced for this team yet.')).toBeInTheDocument();
  });

  it('shows each player\'s opponent, and nothing for one the calendar does not cover', async () => {
    const rows = { t1: [row('a', 't1'), row('b', 't1', { proTeamId: 99, player: { name: 'Unknown Slate', position: 'WR' } })], t2: [] };
    const opponents = { 12: { opponentAbbrev: 'BUF', isHome: true, isBye: false } };
    renderCard({ board: board({ rowsByTeam: rows, opponents }) });
    await open();

    expect(screen.getByText('Unknown Slate').closest('li')).not.toHaveTextContent('BUF');
  });

  it('has no lineups on the home panel, which is the compact card', () => {
    renderCard({ compact: true });
    expect(screen.queryByRole('button', { name: 'Lineups' })).not.toBeInTheDocument();
  });
});
