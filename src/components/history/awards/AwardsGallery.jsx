import React, { useState, useMemo } from 'react';
import { Award, Trophy, Medal, TrendingUp, TrendingDown, Zap, Target, Calendar, ChevronDown, ChevronUp, Vote } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { useSeasonDetails } from '../../../../hooks/queries/index.js';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { formatPoints } from '../utils/statFormatters';

// Award category configuration
const AWARD_CATEGORIES = {
  standard: {
    label: 'Championships & Standings',
    icon: Trophy,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    description: 'Final standings awards'
  },
  regular_season: {
    label: 'Regular Season Excellence',
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    description: 'Best regular season performances'
  },
  dubious: {
    label: 'Dubious Distinctions',
    icon: TrendingDown,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    description: 'Records you might not want'
  },
  advanced: {
    label: 'Advanced Analytics',
    icon: Zap,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    description: 'Analytics-based awards'
  },
  // Awards the league votes on, or hands out by hand. They have a free-text
  // title rather than an `award_type`, so they are grouped by their source.
  ballot: {
    label: 'League Ballot',
    icon: Vote,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    description: 'Voted on by the league'
  }
};

// Award type icons and styling
const AWARD_TYPE_CONFIG = {
  champion: { icon: Trophy, rank: 1, color: 'text-amber-500' },
  runner_up: { icon: Medal, rank: 2, color: 'text-muted-foreground' },
  third_place: { icon: Medal, rank: 3, color: 'text-orange-600' },
  best_record: { icon: Target, rank: 1, color: 'text-green-600' },
  highest_points: { icon: TrendingUp, rank: 1, color: 'text-green-600' },
  most_blowouts: { icon: Zap, rank: 1, color: 'text-green-600' },
  highest_weekly_score: { icon: TrendingUp, rank: 1, color: 'text-green-600' },
  worst_record: { icon: TrendingDown, rank: 1, color: 'text-red-600' },
  lowest_points: { icon: TrendingDown, rank: 1, color: 'text-red-600' },
  most_points_against: { icon: Target, rank: 1, color: 'text-red-600' },
  biggest_blowout_loss: { icon: TrendingDown, rank: 1, color: 'text-red-600' },
  lowest_weekly_score: { icon: TrendingDown, rank: 1, color: 'text-red-600' },
  most_consistent: { icon: Target, rank: 1, color: 'text-purple-600' },
  highest_efficiency: { icon: Zap, rank: 1, color: 'text-purple-600' }
};

const AwardsGallery = ({
  franchises = [],
  seasons = [],
  championships = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewFranchise = () => {},
  onViewSeason = () => {}
}) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [expandedSeasons, setExpandedSeasons] = useState({});

  // One query per season, sharing the cache with the season detail view rather
  // than re-reading every season's awards each time this tab is opened.
  const seasonQueries = useSeasonDetails(seasons.map(season => season.id));

  const allAwards = seasonQueries.flatMap((query, index) =>
    (query.data?.awards ?? []).map(award => ({
      ...award,
      seasonYear: seasons[index].year,
      seasonId: seasons[index].id
    }))
  );

  // Get franchise display name
  const getFranchiseDisplayName = (award) => {
    const franchise = franchises.find(f => f.id === award.franchise_id) || award.franchise;
    if (!franchise) return award.winner_id || 'Unknown';
    return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
  };

  // Group awards by season and category
  const groupedAwards = useMemo(() => {
    let filtered = allAwards;

    // Hide highest_efficiency award (metric doesn't make sense)
    filtered = filtered.filter(a => a.award_type !== 'highest_efficiency');

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(a => a.award_category === selectedCategory);
    }

    // Filter by season
    if (selectedSeason !== 'all') {
      filtered = filtered.filter(a => a.seasonYear === parseInt(selectedSeason));
    }

    // Group by season year
    const bySeasonYear = {};
    filtered.forEach(award => {
      const year = award.seasonYear;
      if (!bySeasonYear[year]) {
        bySeasonYear[year] = {
          year,
          seasonId: award.seasonId,
          categories: {}
        };
      }

      const category = award.award_category;
      if (!bySeasonYear[year].categories[category]) {
        bySeasonYear[year].categories[category] = [];
      }
      bySeasonYear[year].categories[category].push(award);
    });

    // Sort by year descending
    return Object.values(bySeasonYear).sort((a, b) => b.year - a.year);
  }, [allAwards, selectedCategory, selectedSeason]);

  // Calculate award leaderboard (most awards by franchise)
  const awardLeaderboard = useMemo(() => {
    const counts = {};

    allAwards.forEach(award => {
      const franchiseId = award.franchise_id;
      if (!franchiseId) return;

      if (!counts[franchiseId]) {
        counts[franchiseId] = {
          franchiseId,
          total: 0,
          championships: 0,
          regular_season: 0,
          dubious: 0,
          advanced: 0
        };
      }

      counts[franchiseId].total++;
      if (award.award_type === 'champion') {
        counts[franchiseId].championships++;
      }
      if (award.award_category === 'regular_season') {
        counts[franchiseId].regular_season++;
      }
      if (award.award_category === 'dubious') {
        counts[franchiseId].dubious++;
      }
      if (award.award_category === 'advanced') {
        counts[franchiseId].advanced++;
      }
    });

    return Object.values(counts)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(entry => {
        const franchise = franchises.find(f => f.id === entry.franchiseId);
        return {
          ...entry,
          displayName: franchise
            ? getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames)
            : 'Unknown'
        };
      });
  }, [allAwards, franchises, user, isAdmin, teamOwnerNames]);

  const toggleSeasonExpand = (year) => {
    setExpandedSeasons(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };

  // Format award value for display
  const formatAwardValue = (award) => {
    if (!award.value_label) return null;

    // Check if it's a numeric value that should be formatted
    if (award.award_type.includes('points') || award.award_type.includes('score')) {
      const numValue = parseFloat(award.value_label);
      if (!isNaN(numValue)) {
        return formatPoints(numValue);
      }
    }

    return award.value_label;
  };

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Awards Gallery
            <Badge variant="secondary" className="ml-auto">
              {allAwards.length} Awards
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('all')}
              >
                All Categories
              </Button>
              {Object.entries(AWARD_CATEGORIES).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <Button
                    key={key}
                    variant={selectedCategory === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(key)}
                    className="flex items-center gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{config.label.split(' ')[0]}</span>
                  </Button>
                );
              })}
            </div>

            {/* Season Filter */}
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-md bg-background"
            >
              <option value="all">All Seasons</option>
              {seasons.map(season => (
                <option key={season.id} value={season.year}>
                  {season.year}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Award Leaders */}
      {selectedCategory === 'all' && selectedSeason === 'all' && awardLeaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5" />
              Most Decorated Franchises
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {awardLeaderboard.map((entry, index) => {
                // Styling based on rank
                const getRankStyle = () => {
                  if (index === 0) return 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 border-l-4 border-l-amber-500';
                  if (index === 1) return 'bg-gradient-to-r from-gray-400/20 to-gray-400/5 border-l-4 border-l-gray-400';
                  if (index === 2) return 'bg-gradient-to-r from-orange-500/20 to-orange-500/5 border-l-4 border-l-orange-500';
                  return 'hover:bg-muted/50';
                };

                const getRankBadgeStyle = () => {
                  if (index === 0) return 'bg-amber-500 text-white';
                  if (index === 1) return 'bg-gray-400 text-white';
                  if (index === 2) return 'bg-orange-500 text-white';
                  return 'bg-muted text-muted-foreground';
                };

                return (
                  <div
                    key={entry.franchiseId}
                    className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${getRankStyle()}`}
                    onClick={() => onViewFranchise(entry.franchiseId)}
                  >
                    {/* Rank Badge */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankBadgeStyle()}`}>
                      {index + 1}
                    </div>

                    {/* Franchise Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{entry.displayName}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {entry.championships > 0 && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <Trophy className="h-3 w-3" />
                            {entry.championships} {entry.championships === 1 ? 'title' : 'titles'}
                          </span>
                        )}
                        {entry.regular_season > 0 && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <TrendingUp className="h-3 w-3" />
                            {entry.regular_season}
                          </span>
                        )}
                        {entry.dubious > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <TrendingDown className="h-3 w-3" />
                            {entry.dubious}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Total Awards */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-2xl font-bold">{entry.total}</p>
                      <p className="text-xs text-muted-foreground">awards</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awards by Season */}
      {groupedAwards.map(seasonGroup => {
        const isExpanded = expandedSeasons[seasonGroup.year] !== false; // Default expanded

        return (
          <Card key={seasonGroup.year}>
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleSeasonExpand(seasonGroup.year)}
            >
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {seasonGroup.year} Season Awards
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewSeason(seasonGroup.year);
                    }}
                  >
                    View Season
                  </Button>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </CardTitle>
            </CardHeader>

            {isExpanded && (
              <CardContent>
                <div className="space-y-6">
                  {Object.entries(AWARD_CATEGORIES).map(([categoryKey, categoryConfig]) => {
                    const categoryAwards = seasonGroup.categories[categoryKey];
                    if (!categoryAwards || categoryAwards.length === 0) return null;

                    const CategoryIcon = categoryConfig.icon;

                    return (
                      <div key={categoryKey}>
                        <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${categoryConfig.color}`}>
                          <CategoryIcon className="h-4 w-4" />
                          {categoryConfig.label}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {categoryAwards.map((award, index) => {
                            const typeConfig = AWARD_TYPE_CONFIG[award.award_type] || {};
                            const AwardIcon = typeConfig.icon || Award;

                            return (
                              <div
                                key={`${award.id}-${index}`}
                                className={`p-4 rounded-lg ${categoryConfig.bgColor} cursor-pointer hover:opacity-80 transition-opacity`}
                                onClick={() => onViewFranchise(award.franchise_id)}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <AwardIcon className={`h-5 w-5 ${typeConfig.color || categoryConfig.color}`} />
                                    <span className="font-semibold text-sm">
                                      {award.award_name}
                                    </span>
                                  </div>
                                </div>
                                <p className="font-medium">
                                  {getFranchiseDisplayName(award)}
                                </p>
                                {formatAwardValue(award) && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {formatAwardValue(award)}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {groupedAwards.length === 0 && (
        <Card>
          <CardContent className="p-12">
            <p className="text-muted-foreground text-center">
              No awards found for the selected filters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AwardsGallery;
