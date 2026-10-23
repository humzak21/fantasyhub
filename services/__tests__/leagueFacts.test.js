/**
 * Fact cards are the league chat's only source of truth, so what is pinned
 * here is what they say: every game once, each head-to-head told from the
 * leader's side, seasons and careers from the stored placements, and the names
 * a question may use.
 */

import { describe, it, expect } from 'vitest';

import { buildFixture } from './leagueChat.fixture.js';

const built = buildFixture();
const texts = (topic) => built.cards.filter((c) => c.topic === topic || c.topic.startsWith(`${topic}_`)).map((c) => c.text);

describe('buildLeagueFacts', () => {
  it('writes every played game once, to the hundredth, tagged with both owners', () => {
    const games = built.cards.filter((c) => c.topic === 'game');
    expect(games).toHaveLength(7);
    const final = games.find((c) => c.weeks[0] === 15);
    expect(final.text).toBe('2024 week 15, championship game: Anna Park 150.66, Ben Cole 120.06. Anna Park won by 30.60.');
    expect(final).toMatchObject({ owners: ['anna park', 'ben cole'], seasons: [2024], phase: 'playoff' });
  });

  it('tells a series from the leader\'s side, total and split agreeing', () => {
    expect(texts('h2h_series')).toHaveLength(3);
    expect(texts('h2h')).toContain(
      'Anna Park vs Ben Cole, all-time: Anna Park leads Ben Cole 3-1 over 4 games (2-1 in the regular season, 1-0 in the playoffs).'
    );
    expect(texts('h2h')).toContain(
      'Ben Cole vs Cara Diaz, all-time: Ben Cole leads Cara Diaz 1-0 over 1 game (1-0 in the regular season).'
    );
    expect(texts('h2h')).toContain(
      'Anna Park vs Cara Diaz, all-time: the series is tied 1-1 over 2 games (Anna Park: 1-1 in the regular season).'
    );
  });

  it('says who won the last meeting and by how much the closest was decided', () => {
    expect(texts('h2h')).toContain('Ben Cole won the last meeting between Anna Park and Ben Cole.');
    expect(texts('h2h')).toContain('Closest game between Anna Park and Ben Cole: decided by 20.25 in 2024 week 1.');
  });

  it('describes each season from the stored finish, and a season in progress as so far', () => {
    expect(texts('season')).toContain(
      'Anna Park in 2024: 2-1 in the regular season and won the championship, scoring 358.80 points and allowing 330.19.'
    );
    expect(texts('season')).toContain(
      'Ben Cole in 2024: 1-2 in the regular season and finished 2nd (lost the championship game), scoring 311.26 points and allowing 350.70.'
    );
    expect(texts('season')).toContain(
      'Cara Diaz in 2025: 0-1 in the regular season so far (through week 2), scoring 88.80 points and allowing 92.20.'
    );
  });

  it('counts titles and playoff trips from completed seasons only', () => {
    expect(texts('postseason')).toContain(
      "Anna Park's postseason history: made the playoffs 1 time in 1 completed season (2024); won 1 championship (2024); has never lost a championship game."
    );
    expect(texts('postseason')).toContain(
      "Cara Diaz's postseason history: made the playoffs 0 times in 1 completed season; has never won a championship; has never lost a championship game."
    );
    expect(texts('champions')).toEqual(['League champions: 2024 Anna Park.']);
  });

  it('knows this week\'s pairings and the names a question may use', () => {
    expect(built.thisWeek).toEqual([{ a: 'anna park', b: 'ben cole' }]);
    expect(built.lexicon.find((p) => p.key === 'ben cole').names).toEqual(['ben cole', 'ben', 'cole']);
  });
});
