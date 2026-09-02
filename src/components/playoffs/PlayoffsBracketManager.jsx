import React, { useState, useEffect, useCallback } from 'react';
import RouteLoading from '../layout/RouteLoading';
import PageHeader from '../layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Trophy, Target, Settings, AlertCircle, Clock, Users } from 'lucide-react';

import PlayoffsBracket from './PlayoffsBracket';
import PlayoffsBracketAdmin from './PlayoffsBracketAdmin';
import { getSeasonConfig } from '../../../utils/seasonConfig.js';
import { getDb } from '../../../services/db/index.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';

const PlayoffsBracketManager = ({
    season,
    currentWeek,
    loading = false,
    isAuthenticated = false,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
    const [activeTab, setActiveTab] = useState('bracket');
    const [bracketStatus, setBracketStatus] = useState(null);
    const [userPicks, setUserPicks] = useState([]);
    const [allPicks, setAllPicks] = useState([]);
    const [standings, setStandings] = useState([]);
    const [playoffGames, setPlayoffGames] = useState([]);
    // teamId -> playoff seed, for the 2026+ bracket. Projected while the
    // regular season runs and settled once it ends; the two agree by then.
    const [seedByTeamId, setSeedByTeamId] = useState(() => new Map());
    const [dataLoading, setDataLoading] = useState(true);
    const [error, setError] = useState(null);

    // Load bracket data
    const loadBracketData = useCallback(async () => {
        if (!season) return;

        setDataLoading(true);
        setError(null);

        try {
            const [statusData, gamesData, divisionStandings] = await Promise.all([
                getDb().playoffs.getPlayoffBracketStatus(season.id),
                getDb().playoffs.getPlayoffGames(season.id),
                // Seeds are what the 2026+ bracket labels its slots with, not
                // what it needs to render one — so losing them must not blank
                // the page. Pre-2026 the RPC returns nulls here anyway.
                getDb().divisions.getStandingsByDivision(season.id).catch(() => null)
            ]);

            setBracketStatus(statusData);
            setPlayoffGames(gamesData || []);

            const standingsRows = [
                ...(divisionStandings?.divisions || []).flatMap((division) => division.teams || []),
                ...(divisionStandings?.unassigned || [])
            ];
            setSeedByTeamId(
                new Map(
                    standingsRows
                        .filter((row) => row.playoffSeed != null)
                        .map((row) => [row.id, row.playoffSeed])
                )
            );

            // Load user picks if authenticated
            if (user) {
                const userPicksData = await getDb().playoffs.getUserPlayoffPicks(season.id);
                setUserPicks(userPicksData || []);
            }

            // Load all picks and standings if results are released or admin
            if (statusData?.resultsReleased || isAdmin) {
                const [allPicksData, standingsData] = await Promise.all([
                    getDb().playoffs.getAllPlayoffPicks(season.id),
                    getDb().playoffs.getPlayoffStandings(season.id)
                ]);
                setAllPicks(allPicksData || []);
                setStandings(standingsData || []);
            }
        } catch (err) {
            setError(err.message || 'Failed to load bracket data');
        } finally {
            setDataLoading(false);
        }
    }, [season,user, isAdmin]);

    useEffect(() => {
        loadBracketData();
    }, [loadBracketData]);

    // Handle pick submission
    const handleSubmitPicks = useCallback(async (picks) => {
        try {
            await getDb().playoffs.submitPlayoffPicks(season.id, picks);
            // Reload user picks after submission
            const userPicksData = await getDb().playoffs.getUserPlayoffPicks(season.id);
            setUserPicks(userPicksData || []);
            return { success: true };
        } catch (err) {
            throw new Error(err.message || 'Failed to submit picks');
        }
    }, [season]);

    // Handle results release (admin)
    const handleReleaseResults = useCallback(async () => {
        if (!isAdmin) return;

        try {
            await getDb().playoffs.releasePlayoffResults(season.id);
            await loadBracketData();
        } catch (err) {
            setError(err.message || 'Failed to release results');
        }
    }, [isAdmin,season, loadBracketData]);

    // A quiet loader rather than a blank tab. Not a skeleton: the bracket
    // is not a grid of cards, and a card skeleton standing in for it was
    // part of the flash of odd boxes on every navigation.
    if (dataLoading && !bracketStatus) {
        return (
            <>
                <PageHeader icon={Trophy} title="Playoffs" />
                <RouteLoading />
            </>
        );
    }

    if (!season) {
        return (
            <>
                <PageHeader icon={Trophy} title="Playoffs" />
                <Card>
                    <EmptyState
                        icon={Trophy}
                        title="No season available"
                        description="The playoff bracket needs an active season."
                    />
                </Card>
            </>
        );
    }

    const released = Boolean(bracketStatus?.resultsReleased);
    const seasonYear = season?.year ?? getSeasonConfig()?.year ?? null;

    return (
        <div className="space-y-6">
            {/* The status badges sit after the title, the admin's one act sits
                in the actions slot, and the deadline — the fact a reader came
                for — is the toolbar row. It used to be a second card under the
                header card, a strip of muted grey for one date. */}
            <PageHeader
                icon={Trophy}
                title="Playoffs"
                description={`${seasonYear ? `${seasonYear} bracket challenge — ` : ''}predict the playoff and consolation bracket winners.`}
                badge={
                    <>
                        {bracketStatus?.canSubmit ? (
                            <Badge variant="default" className="flex items-center gap-1">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                {bracketStatus.timeRemaining || 'Submissions open'}
                            </Badge>
                        ) : (
                            <Badge variant="secondary">Submissions closed</Badge>
                        )}
                        {released && <Badge variant="success">Results released</Badge>}
                    </>
                }
                actions={
                    isAdmin && !released ? (
                        <Button
                            onClick={handleReleaseResults}
                            variant="outline"
                            size="sm"
                            disabled={dataLoading}
                        >
                            <Settings className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Release results
                        </Button>
                    ) : null
                }
            >
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <Clock className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <span className="font-medium">Deadline</span>
                    <span className="min-w-0 text-muted-foreground">
                        {bracketStatus?.deadlineFormatted || 'Not set'}
                    </span>
                </p>
            </PageHeader>

            {/* Error display */}
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Main content */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full">
                    <TabsTrigger value="bracket" icon={<Target className="h-4 w-4" />}>
                        Bracket
                    </TabsTrigger>
                    <TabsTrigger value="standings" icon={<Trophy className="h-4 w-4" />}>
                        Standings
                    </TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="admin" icon={<Users className="h-4 w-4" />}>
                            Admin
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="bracket">
                    <PlayoffsBracket
                        season={season}
                        playoffGames={playoffGames}
                        userPicks={userPicks}
                        bracketStatus={bracketStatus}
                        onSubmitPicks={handleSubmitPicks}
                        loading={dataLoading}
                        user={user}
                        isAdmin={isAdmin}
                        teamOwnerNames={teamOwnerNames}
                        seedByTeamId={seedByTeamId}
                    />
                </TabsContent>

                <TabsContent value="standings">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Trophy className="h-5 w-5 text-yellow-500" />
                                Bracket Challenge Standings
                            </CardTitle>
                            <CardDescription>
                                {bracketStatus?.resultsReleased
                                    ? 'Final standings based on correct predictions'
                                    : 'Standings will be available after results are released'
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!bracketStatus?.resultsReleased && !isAdmin ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Clock className="h-12 w-12 mx-auto mb-4" />
                                    <p>Results have not been released yet.</p>
                                </div>
                            ) : standings.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Trophy className="h-12 w-12 mx-auto mb-4" />
                                    <p>No picks have been submitted yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {standings.map((standing, index) => (
                                        <div
                                            key={standing.userId}
                                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    {standing.rank === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                                                    <Badge variant={standing.rank <= 3 ? 'default' : 'outline'}>
                                                        #{standing.rank}
                                                    </Badge>
                                                </div>
                                                <div>
                                                    <div className="font-medium">{standing.displayName}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {standing.correctPicks}/{standing.totalPicks} correct
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-semibold">{standing.totalPoints} pts</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {standing.accuracyPercentage?.toFixed(1)}% accuracy
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {isAdmin && (
                    <TabsContent value="admin">
                        <PlayoffsBracketAdmin
                            season={season}
                            allPicks={allPicks}
                            standings={standings}
                            bracketStatus={bracketStatus}
                            onUpdate={loadBracketData}
                            loading={dataLoading}
                            teamOwnerNames={teamOwnerNames}
                            playoffGames={playoffGames}
                        />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
};

export default PlayoffsBracketManager;
