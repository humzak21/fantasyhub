import React, { useState, useEffect, useCallback } from 'react';
import { SkeletonCards } from '../ui/skeleton';
import PageHeader from '../layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
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
    const [dataLoading, setDataLoading] = useState(true);
    const [error, setError] = useState(null);

    // Load bracket data
    const loadBracketData = useCallback(async () => {
        if (!season) return;

        setDataLoading(true);
        setError(null);

        try {
            const [statusData, gamesData] = await Promise.all([
                getDb().playoffs.getPlayoffBracketStatus(season.id),
                getDb().playoffs.getPlayoffGames(season.id)
            ]);

            setBracketStatus(statusData);
            setPlayoffGames(gamesData || []);

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

    // A shape rather than a blank tab; see PickEmsManager for the same fix.
    if (dataLoading && !bracketStatus) {
        return (
            <>
                <PageHeader icon={Trophy} title="Playoffs" />
                <SkeletonCards count={3} columns={3} />
            </>
        );
    }

    if (!season) {
        return (
            <Card>
                <CardContent className="p-8 text-center">
                    <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Season Available</h3>
                    <p className="text-muted-foreground">
                        Playoff bracket requires an active season.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Trophy className="h-5 w-5 text-yellow-500" />
                                {getSeasonConfig()?.year ?? ''} Playoff Bracket Challenge
                            </CardTitle>
                            <CardDescription>
                                Predict the playoff and consolation bracket winners
                            </CardDescription>
                        </div>

                        <div className="flex items-center gap-3">
                            {bracketStatus?.canSubmit ? (
                                <Badge variant="default" className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {bracketStatus.timeRemaining || 'Submissions Open'}
                                </Badge>
                            ) : (
                                <Badge variant="secondary">
                                    Submissions Closed
                                </Badge>
                            )}

                            {bracketStatus?.resultsReleased && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    Results Released
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>

                {/* Deadline Info */}
                <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
                        {/* `min-w-0` and a shrinkable date. The row is
                            `justify-between` with a long formatted deadline on
                            one side and a button on the other; without this the
                            date refuses to shrink and pushes the button past
                            the right edge of a 375px screen. */}
                        <div className="flex min-w-0 items-center gap-2">
                            <Clock className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                            <span className="shrink-0 font-medium">Deadline:</span>
                            <span className="min-w-0 text-sm">
                                {bracketStatus?.deadlineFormatted || 'Not set'}
                            </span>
                        </div>

                        {/* Admin controls */}
                        {isAdmin && !bracketStatus?.resultsReleased && (
                            <Button
                                onClick={handleReleaseResults}
                                variant="outline"
                                size="sm"
                                disabled={dataLoading}
                            >
                                <Settings className="h-4 w-4 mr-2" />
                                Release Results
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

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
