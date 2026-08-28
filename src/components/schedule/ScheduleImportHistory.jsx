import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Terminal } from 'lucide-react';
import { useScheduleImports } from '../../../hooks/queries/useScheduleImports.js';

/**
 * What the ESPN schedule sync has done, newest first.
 *
 * This was `ScheduleImportManager`: a queue of staged imports with "Assign to
 * Season" and "Reject" buttons, because a fetched schedule did nothing until an
 * admin approved it here. `scripts/sync-schedule.js` now writes teams and games
 * as it fetches them, so there is no queue — and no way to start an import from
 * the browser, since ESPN needs cookies only the scripts have. This reports.
 */
const STATUS_STYLES = {
  ASSIGNED: 'default',
  PENDING: 'secondary',
  REJECTED: 'destructive'
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');

const ScheduleImportHistory = () => {
  const { data: imports = [], isLoading, error } = useScheduleImports();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ESPN Import History</CardTitle>
          <CardDescription>
            Every schedule import, newest first. Teams and games are written as the import
            runs — there is nothing to approve here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Terminal size={16} className="mt-0.5 shrink-0" />
            <p>
              Run an import with <code className="font-mono">npm run sync-schedule</code>, or the
              “Import ESPN schedule” workflow in GitHub Actions. Weekly scores come from{' '}
              <code className="font-mono">npm run sync-week</code>, which also creates any
              matchup the season import missed.
            </p>
          </div>

          {isLoading && (
            <div className="flex justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">Could not load the import log: {error.message}</p>
          )}

          {!isLoading && !error && imports.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <p>No imports recorded yet.</p>
            </div>
          )}

          {imports.map((row) => (
            <Card key={row.id} className="border-l-4 border-l-blue-400">
              <CardContent className="pt-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{row.league_name || 'Unnamed League'}</h3>
                  <Badge variant="outline">{row.season_year}</Badge>
                  <Badge variant={STATUS_STYLES[row.assignment_status] ?? 'secondary'}>
                    {row.assignment_status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground md:grid-cols-4">
                  <div>
                    <span className="font-medium">ESPN League</span>
                    <br />
                    {row.espn_league_id}
                  </div>
                  <div>
                    <span className="font-medium">Teams</span>
                    <br />
                    {row.team_count ?? '—'}
                  </div>
                  <div>
                    <span className="font-medium">Matchups</span>
                    <br />
                    {row.total_matchups ?? '—'}
                    {row.playoff_matchups ? ` (${row.playoff_matchups} postseason)` : ''}
                  </div>
                  <div>
                    <span className="font-medium">Ran</span>
                    <br />
                    {formatDate(row.imported_at)}
                  </div>
                </div>

                {row.assignment_notes && (
                  <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-muted-foreground">
                    {row.assignment_notes.trim()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default ScheduleImportHistory;
