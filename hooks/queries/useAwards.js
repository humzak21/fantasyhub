/**
 * Awards hooks.
 *
 * `FantasyFootballApp` loaded the unlock status in two near-identical effects —
 * one on season load, one that re-ran on every switch to the awards tab because
 * the first had no way to know it had gone stale. Both wrote the same piece of
 * state and one of them logged on every render. A query with a short stale time
 * does the same job: the tab switch is a cache read, and a genuine change is
 * picked up on the next refetch or an explicit invalidation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

const EMPTY_STATUS = { votingOpenToAll: false };

export function useAwardsUnlockStatus(seasonId) {
  const query = useQuery({
    queryKey: qk.awards.unlockStatus(seasonId),
    queryFn: async () => (await db().awards.getAwardsUnlockStatus(seasonId)) ?? EMPTY_STATUS,
    enabled: Boolean(seasonId),
    staleTime: 30_000
  });

  return { ...query, status: query.data ?? EMPTY_STATUS };
}

export function useAwards(seasonId) {
  return useQuery({
    queryKey: qk.awards.season(seasonId),
    queryFn: () => db().awards.getAwards(seasonId),
    enabled: Boolean(seasonId)
  });
}

/**
 * The vote tallies for one season, `{ [awardId]: { [voteValue]: count } }`.
 *
 * Season-parametric because the Results tab browses past seasons — the
 * component used to fetch this in a `useEffect` keyed on the active season and
 * so could only ever show the current year.
 */
export function useAwardResults(seasonId) {
  return useQuery({
    queryKey: qk.awards.results(seasonId),
    queryFn: () => db().awards.getAwardResults(seasonId),
    enabled: Boolean(seasonId)
  });
}

/**
 * Every season that has a ballot, newest first. The list changes once a year,
 * so it is cached hard — the shell reads it on every render to decide whether
 * the Awards tab is reachable at all.
 */
export function useAwardBallotSeasons() {
  return useQuery({
    queryKey: qk.awards.ballotSeasons(),
    queryFn: () => db().awards.getBallotSeasons(),
    staleTime: 5 * 60_000
  });
}

export function useAwardsMutations(seasonId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.awards.season(seasonId) });

  return {
    submitVotes: useMutation({
      mutationFn: (votes) => db().awards.submitAwardVotes(seasonId, votes),
      onSuccess: invalidate
    }),
    toggleVotingAccess: useMutation({
      mutationFn: (votingOpenToAll) => db().awards.toggleVotingAccess(seasonId, votingOpenToAll),
      onSuccess: invalidate
    }),
    releaseResults: useMutation({
      mutationFn: () => db().awards.releaseAwardResults(seasonId),
      onSuccess: invalidate
    })
  };
}
