import React from 'react';
import { Calendar, Trophy, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { formatSeasonYear } from '../utils/statFormatters';
import { isCurrentSeason } from '../../../../utils/seasonConfig.js';

const SeasonArchive = ({
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
          <p className="text-muted-foreground text-center">No seasons available</p>
        </CardContent>
      </Card>
    );
  }

  const sortedSeasons = [...seasons].sort((a, b) => b.year - a.year);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Season Archive
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedSeasons.map(season => {
          const seasonIsCurrent = isCurrentSeason(season);
          return (
            <Card key={season.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onSeasonClick(season.year)}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{season.year}</span>
                  {seasonIsCurrent && (
                    <Badge variant="secondary">In Progress</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Teams</span>
                  <span className="font-medium">{season.league_size || 14}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Weeks</span>
                  <span className="font-medium">{season.regular_season_weeks || 14}</span>
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  View Details
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SeasonArchive;
