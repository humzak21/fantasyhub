import { describe, it, expect } from 'vitest';
import {
  isPlayoffWeek,
  getWeekLabel,
  canNavigateWeek,
  getNextWeek,
  normalizeWeek,
  getWeekType
} from '../weekLabelUtils';

describe('weekLabelUtils', () => {
  describe('isPlayoffWeek', () => {
    it('returns false for regular season weeks', () => {
      expect(isPlayoffWeek(1, 14)).toBe(false);
      expect(isPlayoffWeek(7, 14)).toBe(false);
      expect(isPlayoffWeek(14, 14)).toBe(false);
    });

    it('returns true for playoff weeks', () => {
      expect(isPlayoffWeek(15, 14)).toBe(true);
      expect(isPlayoffWeek(16, 14)).toBe(true);
      expect(isPlayoffWeek(17, 14)).toBe(true);
    });

    it('handles edge cases with invalid inputs', () => {
      expect(isPlayoffWeek(null, 14)).toBe(false);
      expect(isPlayoffWeek(15, null)).toBe(false);
      expect(isPlayoffWeek(0, 14)).toBe(false);
      expect(isPlayoffWeek(15, 0)).toBe(false);
    });
  });

  describe('getWeekLabel', () => {
    describe('regular season weeks', () => {
      it('formats regular season weeks correctly', () => {
        expect(getWeekLabel(1, 14, 17)).toBe('Week 1');
        expect(getWeekLabel(7, 14, 17)).toBe('Week 7');
        expect(getWeekLabel(14, 14, 17)).toBe('Week 14');
      });
    });

    describe('playoff weeks', () => {
      it('formats playoff weeks correctly for standard 3-week playoffs', () => {
        expect(getWeekLabel(15, 14, 17)).toBe('Playoffs R1');
        expect(getWeekLabel(16, 14, 17)).toBe('Semifinals');
        expect(getWeekLabel(17, 14, 17)).toBe('Championship');
      });

      it('formats single playoff week as Championship', () => {
        expect(getWeekLabel(15, 14, 15)).toBe('Championship');
      });

      it('formats two playoff weeks correctly', () => {
        expect(getWeekLabel(15, 14, 16)).toBe('Playoffs R1');
        expect(getWeekLabel(16, 14, 16)).toBe('Championship');
      });

      it('formats four playoff weeks correctly', () => {
        expect(getWeekLabel(15, 14, 18)).toBe('Playoffs R1');
        expect(getWeekLabel(16, 14, 18)).toBe('Playoffs R2');
        expect(getWeekLabel(17, 14, 18)).toBe('Semifinals');
        expect(getWeekLabel(18, 14, 18)).toBe('Championship');
      });
    });

    describe('edge cases', () => {
      it('handles invalid inputs gracefully', () => {
        expect(getWeekLabel(null, 14, 17)).toBe('Week 1');
        expect(getWeekLabel(5, null, 17)).toBe('Week 5');
        expect(getWeekLabel(5, 14, null)).toBe('Week 5');
        expect(getWeekLabel(0, 14, 17)).toBe('Week 1');
      });

      it('normalizes week numbers outside valid range', () => {
        expect(getWeekLabel(25, 14, 17)).toBe('Championship');
        expect(getWeekLabel(-5, 14, 17)).toBe('Week 1');
      });

      it('handles edge case where regularSeasonWeeks equals totalWeeks', () => {
        expect(getWeekLabel(14, 14, 14)).toBe('Week 14');
      });
    });
  });

  describe('canNavigateWeek', () => {
    describe('previous navigation', () => {
      it('allows navigation from week 2 and above', () => {
        expect(canNavigateWeek(2, 17, 'previous')).toBe(true);
        expect(canNavigateWeek(10, 17, 'previous')).toBe(true);
        expect(canNavigateWeek(17, 17, 'previous')).toBe(true);
      });

      it('prevents navigation from week 1', () => {
        expect(canNavigateWeek(1, 17, 'previous')).toBe(false);
      });
    });

    describe('next navigation', () => {
      it('allows navigation up to second-to-last week', () => {
        expect(canNavigateWeek(1, 17, 'next')).toBe(true);
        expect(canNavigateWeek(10, 17, 'next')).toBe(true);
        expect(canNavigateWeek(16, 17, 'next')).toBe(true);
      });

      it('prevents navigation from last week', () => {
        expect(canNavigateWeek(17, 17, 'next')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('handles invalid inputs', () => {
        expect(canNavigateWeek(null, 17, 'previous')).toBe(false);
        expect(canNavigateWeek(5, null, 'previous')).toBe(false);
        expect(canNavigateWeek(5, 17, 'invalid')).toBe(false);
        expect(canNavigateWeek(0, 17, 'previous')).toBe(false);
      });

      it('handles single week season', () => {
        expect(canNavigateWeek(1, 1, 'previous')).toBe(false);
        expect(canNavigateWeek(1, 1, 'next')).toBe(false);
      });
    });
  });

  describe('getNextWeek', () => {
    describe('previous navigation', () => {
      it('returns correct previous week', () => {
        expect(getNextWeek(5, 17, 'previous')).toBe(4);
        expect(getNextWeek(17, 17, 'previous')).toBe(16);
        expect(getNextWeek(2, 17, 'previous')).toBe(1);
      });

      it('returns null when navigation is invalid', () => {
        expect(getNextWeek(1, 17, 'previous')).toBe(null);
      });
    });

    describe('next navigation', () => {
      it('returns correct next week', () => {
        expect(getNextWeek(5, 17, 'next')).toBe(6);
        expect(getNextWeek(1, 17, 'next')).toBe(2);
        expect(getNextWeek(16, 17, 'next')).toBe(17);
      });

      it('returns null when navigation is invalid', () => {
        expect(getNextWeek(17, 17, 'next')).toBe(null);
      });
    });

    describe('edge cases', () => {
      it('handles invalid inputs', () => {
        expect(getNextWeek(null, 17, 'next')).toBe(null);
        expect(getNextWeek(5, null, 'next')).toBe(null);
        expect(getNextWeek(5, 17, 'invalid')).toBe(null);
      });

      it('enforces boundaries correctly', () => {
        expect(getNextWeek(0, 17, 'previous')).toBe(null);
        expect(getNextWeek(18, 17, 'next')).toBe(null);
      });
    });
  });

  describe('normalizeWeek', () => {
    it('returns week unchanged when within valid range', () => {
      expect(normalizeWeek(5, 17)).toBe(5);
      expect(normalizeWeek(1, 17)).toBe(1);
      expect(normalizeWeek(17, 17)).toBe(17);
    });

    it('clamps week to minimum value of 1', () => {
      expect(normalizeWeek(0, 17)).toBe(1);
      expect(normalizeWeek(-5, 17)).toBe(1);
    });

    it('clamps week to maximum value of totalWeeks', () => {
      expect(normalizeWeek(25, 17)).toBe(17);
      expect(normalizeWeek(100, 17)).toBe(17);
    });

    it('handles invalid inputs', () => {
      expect(normalizeWeek(null, 17)).toBe(1);
      expect(normalizeWeek(5, null)).toBe(1);
      expect(normalizeWeek(null, null)).toBe(1);
    });
  });

  describe('getWeekType', () => {
    it('returns "regular" for regular season weeks', () => {
      expect(getWeekType(1, 14, 17)).toBe('regular');
      expect(getWeekType(7, 14, 17)).toBe('regular');
      expect(getWeekType(14, 14, 17)).toBe('regular');
    });

    it('returns "playoffs" for non-championship playoff weeks', () => {
      expect(getWeekType(15, 14, 17)).toBe('playoffs');
      expect(getWeekType(16, 14, 18)).toBe('playoffs');
    });

    it('returns "championship" for championship week', () => {
      expect(getWeekType(17, 14, 17)).toBe('championship');
      expect(getWeekType(16, 14, 16)).toBe('championship');
      expect(getWeekType(15, 14, 15)).toBe('championship');
    });

    it('handles edge cases', () => {
      expect(getWeekType(null, 14, 17)).toBe('regular');
      expect(getWeekType(5, null, 17)).toBe('regular');
      expect(getWeekType(5, 14, null)).toBe('regular');
    });

    it('normalizes week numbers outside valid range', () => {
      expect(getWeekType(25, 14, 17)).toBe('championship');
      expect(getWeekType(-5, 14, 17)).toBe('regular');
    });
  });

  describe('integration scenarios', () => {
    it('handles standard 17-week season with 14 regular season weeks', () => {
      // Regular season
      expect(getWeekLabel(1, 14, 17)).toBe('Week 1');
      expect(getWeekType(1, 14, 17)).toBe('regular');
      expect(canNavigateWeek(1, 17, 'previous')).toBe(false);
      expect(canNavigateWeek(1, 17, 'next')).toBe(true);

      // Mid-season
      expect(getWeekLabel(8, 14, 17)).toBe('Week 8');
      expect(getWeekType(8, 14, 17)).toBe('regular');
      expect(canNavigateWeek(8, 17, 'previous')).toBe(true);
      expect(canNavigateWeek(8, 17, 'next')).toBe(true);

      // Playoffs
      expect(getWeekLabel(15, 14, 17)).toBe('Playoffs R1');
      expect(getWeekType(15, 14, 17)).toBe('playoffs');
      expect(canNavigateWeek(15, 17, 'previous')).toBe(true);
      expect(canNavigateWeek(15, 17, 'next')).toBe(true);

      // Championship
      expect(getWeekLabel(17, 14, 17)).toBe('Championship');
      expect(getWeekType(17, 14, 17)).toBe('championship');
      expect(canNavigateWeek(17, 17, 'previous')).toBe(true);
      expect(canNavigateWeek(17, 17, 'next')).toBe(false);
    });

    it('handles short season with single playoff week', () => {
      expect(getWeekLabel(13, 12, 13)).toBe('Championship');
      expect(getWeekType(13, 12, 13)).toBe('championship');
    });

    it('handles navigation boundaries correctly', () => {
      expect(getNextWeek(1, 17, 'previous')).toBe(null);
      expect(getNextWeek(2, 17, 'previous')).toBe(1);
      expect(getNextWeek(16, 17, 'next')).toBe(17);
      expect(getNextWeek(17, 17, 'next')).toBe(null);
    });
  });
});