import React, { useMemo, useState } from 'react';
import { Award, Calendar, ChevronDown, ChevronUp, Medal, Vote } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { EmptyState } from '../../ui/empty-state';
import { RankBadge } from '../../ui/rank-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TeamAvatar } from '../../ui/team-identity';
import { useSeasonDetails } from '../../../../hooks/queries/index.js';
import { canViewFullData, getMaskedFranchiseName } from '../utils/privacyHelpers';

/**
 * The league's voted awards, season by season.
 *
 * This used to hold three kinds of award in five categories — computed stat
 * awards, the admin's hand-entered stat awards, and the ones the league votes
 * on — and its "most decorated" board counted all of them, so a franchise was
 * decorated mostly for having scored a lot of points. Every stat award is a
 * record in the record book now, ranked rather than naming one winner. What is
 * left here is what only a ballot can decide.
 *
 * `getSeasonDetail` does the filtering (`shapeAwards`), so every surface that
 * shows awards — this gallery, a season, a franchise profile — agrees.
 */
const AwardsGallery = ({
  franchises = [],
  seasons = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewFranchise = () => {},
  onViewSeason = () => {},
  onViewRecords = () => {}
}) => {
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [collapsed, setCollapsed] = useState({});

  // One query per season, sharing the cache with the season detail view.
  const seasonQueries = useSeasonDetails(seasons.map((season) => season.id));
  const isLoading = seasonQueries.some((query) => query.isLoading);

  const allAwards = seasonQueries.flatMap((query, index) =>
    (query.data?.awards ?? []).map((award) => ({ ...award, seasonYear: seasons[index].year }))
  );

  const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
  const franchiseFor = (award) => franchises.find((f) => f.id === award.franchise_id) || award.franchise;

  // An owner name with no franchise behind it is still an owner's name; a
  // viewer who may not see names does not see that one either.
  const winnerName = (award) => {
    const franchise = franchiseFor(award);
    if (franchise) return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
    return fullData ? award.winner_id || 'Unknown' : 'Unknown';
  };

  const bySeason = useMemo(() => {
    const groups = new Map();
    for (const award of allAwards) {
      if (selectedSeason !== 'all' && award.seasonYear !== Number(selectedSeason)) continue;
      if (!groups.has(award.seasonYear)) groups.set(award.seasonYear, []);
      groups.get(award.seasonYear).push(award);
    }
    return [...groups.entries()].sort(([a], [b]) => b - a);
  }, [allAwards, selectedSeason]);

  const leaders = useMemo(() => {
    const counts = new Map();
    for (const award of allAwards) {
      if (!award.franchise_id) continue;
      counts.set(award.franchise_id, (counts.get(award.franchise_id) ?? 0) + 1);
    }

    let rank = 0;
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([franchiseId, total], index, list) => {
        if (index === 0 || list[index - 1][1] !== total) rank = index + 1;
        return { franchiseId, total, rank };
      });
  }, [allAwards]);

  const header = (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" aria-hidden="true" />
              League Awards
              {allAwards.length > 0 && <Badge variant="secondary">{allAwards.length}</Badge>}
            </CardTitle>
            <CardDescription>
              Voted on by the league each season. Stat honors — best record, highest score, most
              points against — are ranked in the record book.
            </CardDescription>
          </div>
          {seasons.length > 1 && (
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Season">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All seasons</SelectItem>
                {seasons.map((season) => (
                  <SelectItem key={season.id} value={String(season.year)}>
                    {season.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
    </Card>
  );

  if (!isLoading && allAwards.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={Award}
            title="No voted awards decided yet"
            description="Awards appear here once the league's ballot results are released and a winner is set."
            action={
              <Button variant="outline" size="sm" onClick={onViewRecords}>
                <Medal className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Open the record book
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {selectedSeason === 'all' && leaders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4" aria-hidden="true" />
              Most decorated
            </CardTitle>
            <CardDescription>Voted awards won, every season.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y divide-border/60">
              {leaders.map((entry) => {
                const franchise = franchises.find((f) => f.id === entry.franchiseId);
                const name = getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
                return (
                  <li key={entry.franchiseId} className="flex items-center gap-3 py-2">
                    <RankBadge rank={entry.rank} size="sm" showDelta={false} />
                    <button
                      type="button"
                      onClick={() => onViewFranchise(entry.franchiseId)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/50"
                    >
                      <TeamAvatar
                        team={fullData && franchise ? { franchiseId: entry.franchiseId, owner_name: franchise.owner_name } : { franchiseId: entry.franchiseId, name }}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                      <span className="tabular text-sm font-semibold">{entry.total}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {bySeason.map(([year, awards]) => {
        const isOpen = !collapsed[year];
        const season = seasons.find((s) => s.year === year);

        return (
          <Card key={year}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setCollapsed((prev) => ({ ...prev, [year]: isOpen }))}
                  className="flex items-center gap-2 text-left text-base font-semibold"
                >
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  {year} season
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
                {season && (
                  <Button variant="ghost" size="sm" onClick={() => onViewSeason(year)}>
                    View season
                  </Button>
                )}
              </div>
            </CardHeader>

            {isOpen && (
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {awards.map((award) => (
                    <button
                      key={award.id}
                      type="button"
                      disabled={!award.franchise_id}
                      onClick={() => award.franchise_id && onViewFranchise(award.franchise_id)}
                      className="rounded-lg border border-border bg-muted/30 p-4 text-left transition-colors enabled:hover:bg-muted/60 disabled:cursor-default"
                    >
                      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        <Vote className="h-3.5 w-3.5 text-info" aria-hidden="true" />
                        {award.award_name}
                      </span>
                      <span className="mt-2 block truncate font-medium">{winnerName(award)}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default AwardsGallery;
