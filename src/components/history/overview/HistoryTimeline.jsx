import React from 'react';
import { Trophy, Medal, Calendar, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { formatSeasonYear } from '../utils/statFormatters';
import { isCurrentSeason } from '../../../../utils/seasonConfig.js';

const HistoryTimeline = ({
  seasons = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onSeasonClick = () => {}
}) => {
  if (!seasons.length) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">No season history available</p>
        </CardContent>
      </Card>
    );
  }

  // Sort seasons in descending order (most recent first)
  const sortedSeasons = [...seasons].sort((a, b) => b.year - a.year);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Season Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedSeasons.map((season) => {
            const seasonIsCurrent = isCurrentSeason(season);
            const results = season.playoff_results || {};
            const champion = results.champion;
            const runnerUp = results.runner_up;
            const thirdPlace = results.third_place;

            return (
              <div
                key={season.id || season.year}
                className="group relative overflow-hidden rounded-xl border bg-gradient-to-br from-card to-card/50 hover:shadow-lg hover:border-primary/30 transition-all duration-300 cursor-pointer"
                onClick={() => onSeasonClick(season.year)}
              >
                {/* Decorative gradient accent */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-gray-400 to-amber-700 opacity-80" />

                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md ${
                          champion
                            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white'
                            : seasonIsCurrent
                            ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                            : 'bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground'
                        }`}
                      >
                        '{season.year.toString().slice(-2)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                          {formatSeasonYear(season.year)}
                          {seasonIsCurrent && (
                            <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                              Live
                            </Badge>
                          )}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {season.league_size || 14} teams • {season.regular_season_weeks || 14} weeks
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>

                  {/* Podium - Top 3 */}
                  {(champion || runnerUp || thirdPlace) && (
                    <div className="grid grid-cols-3 gap-3">
                      {/* Champion - 1st */}
                      <div className={`rounded-lg p-3 ${champion ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/30'}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          <span className="text-xs font-semibold text-amber-500">1st</span>
                        </div>
                        {champion && champion.franchise ? (
                          <>
                            <p className="font-medium text-sm truncate">
                              {getMaskedFranchiseName(champion.franchise, user, isAdmin, teamOwnerNames)}
                            </p>
                            {champion.record && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {champion.record}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">-</p>
                        )}
                      </div>

                      {/* Runner-up - 2nd */}
                      <div className={`rounded-lg p-3 ${runnerUp ? 'bg-gray-500/10 border border-border/20' : 'bg-muted/30'}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Medal className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">2nd</span>
                        </div>
                        {runnerUp && runnerUp.franchise ? (
                          <>
                            <p className="font-medium text-sm truncate">
                              {getMaskedFranchiseName(runnerUp.franchise, user, isAdmin, teamOwnerNames)}
                            </p>
                            {runnerUp.record && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {runnerUp.record}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">-</p>
                        )}
                      </div>

                      {/* Third Place - 3rd */}
                      <div className={`rounded-lg p-3 ${thirdPlace ? 'bg-amber-700/10 border border-amber-700/20' : 'bg-muted/30'}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Medal className="h-4 w-4 text-amber-700" />
                          <span className="text-xs font-semibold text-amber-700">3rd</span>
                        </div>
                        {thirdPlace && thirdPlace.franchise ? (
                          <>
                            <p className="font-medium text-sm truncate">
                              {getMaskedFranchiseName(thirdPlace.franchise, user, isAdmin, teamOwnerNames)}
                            </p>
                            {thirdPlace.record && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {thirdPlace.record}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">-</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* In progress indicator */}
                  {seasonIsCurrent && (
                    <p className="text-xs text-muted-foreground italic mt-3 pt-3 border-t border-border/50">
                      Season in progress. Final standings TBD.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default HistoryTimeline;
