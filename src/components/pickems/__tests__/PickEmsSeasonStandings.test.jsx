/**
 * The season standings.
 *
 * Two things are worth pinning here. The podium is one place wide: the league
 * pays the top score and nothing else, so second and third wore ribbons that
 * promised a prize that does not exist. And everyone level at the top has won
 * — the rows arrive numbered by array position, so a rank-based read would
 * hand the trophy to whichever of them the sort happened to put first.
 *
 * The tourney rules are asserted because they are the reason a member opens
 * this tab at all: the points column cannot tell them whether they have played
 * enough weeks to be paid.
 *
 * The tab has three views of one set of picks, the two tourneys and the season,
 * and the standings and team popularity have to agree on which weeks they count.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PickEmsSeasonStandings from '../PickEmsSeasonStandings';

/** One pick, on the shape `getAllSeasonPicks` returns. */
const pick = (userId, displayName, weekNumber, { correct = true, played = true } = {}) => ({
  userId,
  displayName,
  weekNumber,
  gameCompleted: played,
  isCorrect: played && correct,
  pickedTeamId: 't1',
  pickedTeamName: 'Gridiron Gang',
  team1Id: 't1',
  team1Name: 'Gridiron Gang',
  team2Id: 't2',
  team2Name: 'Waiver Wire Wizards'
});

/** A member's picks in a week: `hits` right, then `misses` wrong. */
const week = (userId, displayName, weekNumber, hits, misses = 0) => [
  ...Array.from({ length: hits }, () => pick(userId, displayName, weekNumber)),
  ...Array.from({ length: misses }, () => pick(userId, displayName, weekNumber, { correct: false }))
];

const renderStandings = (seasonPicks, props = {}) =>
  render(
    <PickEmsSeasonStandings
      currentWeek={4}
      seasonPicks={seasonPicks}
      resultsAvailable
      isAdmin
      {...props}
    />
  );

/** The row a member's name sits in. */
const rowFor = (name) => screen.getByText(name).closest('.rounded-lg');

const scoreIn = (name) => within(rowFor(name)).getByText(/\d+ pts/);

const openTab = (name) => userEvent.click(screen.getByRole('tab', { name }));

describe('PickEmsSeasonStandings', () => {
  it('gives the leader a trophy and nobody else a podium mark', () => {
    renderStandings([
      ...week('a', 'Humza Khalil', 1, 7),
      ...week('b', 'Arya Shah', 1, 5),
      ...week('c', 'Rohit Ramki', 1, 3)
    ]);

    expect(within(rowFor('Humza Khalil')).getByText('1st')).toHaveClass('text-warning');
    // Second and third carry their place as plain muted text — no badge, no
    // ribbon, nothing that reads as a prize.
    expect(within(rowFor('Arya Shah')).getByText('2nd')).toHaveClass('text-muted-foreground');
    expect(within(rowFor('Rohit Ramki')).getByText('3rd')).toHaveClass('text-muted-foreground');
  });

  it('crowns everyone on the top score, not whoever sorted first', () => {
    renderStandings([
      ...week('a', 'Humza Khalil', 1, 6, 1),
      ...week('b', 'Arya Shah', 1, 6),
      ...week('c', 'Rohit Ramki', 1, 4)
    ]);

    expect(screen.getAllByText('T-1st')).toHaveLength(2);
    // The tie consumed second place; the next member is third.
    expect(within(rowFor('Rohit Ramki')).getByText('3rd')).toBeInTheDocument();
  });

  it('states both tourneys and the participation floor', () => {
    renderStandings(week('a', 'Humza Khalil', 1, 7));

    expect(screen.getByText(/\$20 FAAB for this year/)).toBeInTheDocument();
    expect(screen.getByText(/\$20 FAAB for next year/)).toBeInTheDocument();
    expect(screen.getAllByText(/at least 5 of the/)).toHaveLength(2);
  });

  it('counts a record against the games played, and says what is still pending', () => {
    // Week 1 scored 5 from 7, week 2 entered and not kicked off: 5/7, never
    // 5/14 — the seven unplayed games are not seven wrong answers.
    renderStandings([
      ...week('a', 'Humza Khalil', 1, 5, 2),
      ...Array.from({ length: 7 }, () => pick('a', 'Humza Khalil', 2, { played: false }))
    ]);

    const row = rowFor('Humza Khalil');
    expect(within(row).getByText('5/7 picks')).toBeInTheDocument();
    expect(within(row).getByText('7 pending')).toBeInTheDocument();
    expect(within(row).queryByText('5/14 picks')).not.toBeInTheDocument();
    expect(within(row).getByText('71.4% overall')).toBeInTheDocument();
  });

  it('says nothing about pending picks once the week has been played', () => {
    renderStandings(week('a', 'Humza Khalil', 1, 7));

    expect(within(rowFor('Humza Khalil')).queryByText(/pending/)).not.toBeInTheDocument();
  });

  it('explains an empty season rather than rendering a bare list', () => {
    renderStandings([]);

    expect(screen.getByText(/no season standings yet/i)).toBeInTheDocument();
  });

  describe('the three views', () => {
    const SEASON = [
      ...week('a', 'Humza Khalil', 8, 6),
      ...week('a', 'Humza Khalil', 9, 1),
      ...week('b', 'Arya Shah', 8, 2),
      ...week('b', 'Arya Shah', 9, 7)
    ];

    it('opens on the view it is given', () => {
      renderStandings(SEASON, { defaultScopeId: 'second-half' });

      expect(screen.getByRole('tab', { name: 'Weeks 9–17' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByText('Weeks 9–17 Standings')).toBeInTheDocument();
    });

    it('offers the two tourneys and then the season', () => {
      renderStandings(SEASON);

      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Weeks 1–8',
        'Weeks 9–17',
        'Season-long'
      ]);
    });

    it("counts each view's weeks and nothing else", async () => {
      renderStandings(SEASON, { defaultScopeId: 'first-half' });

      expect(scoreIn('Humza Khalil')).toHaveTextContent('6 pts');
      expect(scoreIn('Arya Shah')).toHaveTextContent('2 pts');
      expect(within(rowFor('Humza Khalil')).getByText('1 week')).toBeInTheDocument();

      await openTab('Weeks 9–17');
      expect(scoreIn('Humza Khalil')).toHaveTextContent('1 pts');
      expect(scoreIn('Arya Shah')).toHaveTextContent('7 pts');

      await openTab('Season-long');
      expect(scoreIn('Humza Khalil')).toHaveTextContent('7 pts');
      expect(scoreIn('Arya Shah')).toHaveTextContent('9 pts');
    });

    it('filters team popularity to the same weeks, and says so', async () => {
      renderStandings(SEASON, { defaultScopeId: 'first-half' });

      expect(screen.getByText('8 picks in 8 matchups')).toBeInTheDocument();
      expect(screen.getByText(/picked to win in weeks 1–8/)).toBeInTheDocument();
      expect(screen.getByText(/total matchups in weeks 1–8/)).toBeInTheDocument();
      expect(screen.getByText(/picked by users in weeks 1–8/)).toBeInTheDocument();

      await openTab('Season-long');
      expect(screen.getByText('16 picks in 16 matchups')).toBeInTheDocument();
      expect(screen.getByText(/across all matchups this season/)).toBeInTheDocument();
    });

    it('explains a tourney nobody has played yet', () => {
      renderStandings(week('a', 'Humza Khalil', 3, 7), { defaultScopeId: 'second-half' });

      expect(screen.getByText('No weeks 9–17 standings yet')).toBeInTheDocument();
      expect(screen.queryByText('Team Pick Popularity')).not.toBeInTheDocument();
    });

    it('warns about an unfinished week only in a view that includes it', async () => {
      renderStandings(SEASON, {
        currentWeek: 10,
        resultsAvailable: false,
        defaultScopeId: 'first-half'
      });

      expect(screen.queryByText(/do not include Week 10/)).not.toBeInTheDocument();

      await openTab('Weeks 9–17');
      expect(screen.getByText(/do not include Week 10/)).toBeInTheDocument();

      await openTab('Season-long');
      expect(screen.getByText(/do not include Week 10/)).toBeInTheDocument();
    });
  });
});
