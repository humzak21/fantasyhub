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
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import PickEmsSeasonStandings from '../PickEmsSeasonStandings';

const standing = (userId, displayName, totalPoints, overrides = {}) => ({
  userId,
  displayName,
  totalPoints,
  totalPicks: 21,
  totalDecidedPicks: 21,
  totalCorrectPicks: totalPoints,
  totalWeeksParticipated: 3,
  perfectWeeks: 0,
  overallAccuracyPercentage: (totalPoints / 21) * 100,
  ...overrides
});

const renderStandings = (seasonStandings, props = {}) =>
  render(
    <PickEmsSeasonStandings
      currentWeek={4}
      seasonStandings={seasonStandings}
      resultsAvailable
      isAdmin
      {...props}
    />
  );

/** The row a member's name sits in. */
const rowFor = (name) => screen.getByText(name).closest('.rounded-lg');

describe('PickEmsSeasonStandings', () => {
  it('gives the leader a trophy and nobody else a podium mark', () => {
    renderStandings([
      standing('a', 'Humza Khalil', 18),
      standing('b', 'Arya Shah', 15),
      standing('c', 'Rohit Ramki', 12)
    ]);

    expect(within(rowFor('Humza Khalil')).getByText('1st')).toHaveClass('text-warning');
    // Second and third carry their place as plain muted text — no badge, no
    // ribbon, nothing that reads as a prize.
    expect(within(rowFor('Arya Shah')).getByText('2nd')).toHaveClass('text-muted-foreground');
    expect(within(rowFor('Rohit Ramki')).getByText('3rd')).toHaveClass('text-muted-foreground');
  });

  it('crowns everyone on the top score, not whoever sorted first', () => {
    renderStandings([
      standing('a', 'Humza Khalil', 18, { overallAccuracyPercentage: 90 }),
      standing('b', 'Arya Shah', 18, { overallAccuracyPercentage: 70 }),
      standing('c', 'Rohit Ramki', 12)
    ]);

    expect(screen.getAllByText('T-1st')).toHaveLength(2);
    // The tie consumed second place; the next member is third.
    expect(within(rowFor('Rohit Ramki')).getByText('3rd')).toBeInTheDocument();
  });

  it('states both tourneys and the participation floor', () => {
    renderStandings([standing('a', 'Humza Khalil', 18)]);

    expect(screen.getByText(/Weeks 1–8/)).toBeInTheDocument();
    expect(screen.getByText(/\$20 FAAB for this year/)).toBeInTheDocument();
    expect(screen.getByText(/Weeks 9–17/)).toBeInTheDocument();
    expect(screen.getByText(/\$20 FAAB for next year/)).toBeInTheDocument();
    expect(screen.getAllByText(/at least 5 of the/)).toHaveLength(2);
  });

  it('counts a record against the games played, and says what is still pending', () => {
    // Week 1 scored 5 from 7, week 2 entered and not kicked off: 5/7, never
    // 5/14 — the seven unplayed games are not seven wrong answers.
    renderStandings([
      standing('a', 'Humza Khalil', 5, {
        totalPicks: 14,
        totalDecidedPicks: 7,
        totalCorrectPicks: 5,
        totalWeeksParticipated: 2,
        overallAccuracyPercentage: (5 / 7) * 100
      })
    ]);

    const row = rowFor('Humza Khalil');
    expect(within(row).getByText('5/7 picks')).toBeInTheDocument();
    expect(within(row).getByText('7 pending')).toBeInTheDocument();
    expect(within(row).queryByText('5/14 picks')).not.toBeInTheDocument();
    expect(within(row).getByText('71.4% overall')).toBeInTheDocument();
  });

  it('says nothing about pending picks once the week has been played', () => {
    renderStandings([standing('a', 'Humza Khalil', 18)]);

    expect(within(rowFor('Humza Khalil')).queryByText(/pending/)).not.toBeInTheDocument();
  });

  it('explains an empty season rather than rendering a bare list', () => {
    renderStandings([]);

    expect(screen.getByText(/no season standings yet/i)).toBeInTheDocument();
  });
});
