import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Trophy, Target, Settings, AlertCircle, Clock, Users } from 'lucide-react';

import PlayoffsBracket from './PlayoffsBracket';
import PlayoffsBracketAdmin from './PlayoffsBracketAdmin';
import { getSeasonConfig } from '../../../utils/seasonConfig.js';

const PlayoffsBracketManager = ({
    season,
    currentWeek,
    dataManager,
    loading = false,
    isAuthenticated = false,
    isAdmin = false,
    user = null,
    teamOwnerNames = []
}) => {
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
        if (!season || !dataManager) return;

        setDataLoading(true);
        setError(null);

        try {
            const [statusData, gamesData] = await Promise.all([
                dataManager.getPlayoffBracketStatus(season.id),
                dataManager.getPlayoffGames(season.id)
            ]);

            setBracketStatus(statusData);
            setPlayoffGames(gamesData || []);

            // Load user picks if authenticated
            if (user) {
                const userPicksData = await dataManager.getUserPlayoffPicks(season.id);
                setUserPicks(userPicksData || []);
            }

            // Load all picks and standings if results are released or admin
            if (statusData?.resultsReleased || isAdmin) {
                const [allPicksData, standingsData] = await Promise.all([
                    dataManager.getAllPlayoffPicks(season.id),
                    dataManager.getPlayoffStandings(season.id)
                ]);
                setAllPicks(allPicksData || []);
                setStandings(standingsData || []);
            }
        } catch (err) {
            setError(err.message || 'Failed to load bracket data');
        } finally {
            setDataLoading(false);
        }
    }, [season, dataManager, user, isAdmin]);

    useEffect(() => {
        loadBracketData();
    }, [loadBracketData]);

    // Handle pick submission
    const handleSubmitPicks = useCallback(async (picks) => {
        try {
            await dataManager.submitPlayoffPicks(season.id, picks);
            // Reload user picks after submission
            const userPicksData = await dataManager.getUserPlayoffPicks(season.id);
            setUserPicks(userPicksData || []);
            return { success: true };
        } catch (err) {
            throw new Error(err.message || 'Failed to submit picks');
        }
    }, [dataManager, season]);

    // Handle results release (admin)
    const handleReleaseResults = useCallback(async () => {
        if (!isAdmin) return;

        try {
            await dataManager.releasePlayoffResults(season.id);
            await loadBracketData();
        } catch (err) {
            setError(err.message || 'Failed to release results');
        }
    }, [isAdmin, dataManager, season, loadBracketData]);

    if (dataLoading && !bracketStatus) {
        return null;
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
                    <div className="flex items-center justify-between">
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
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-orange-600" />
                                <span className="font-medium">Deadline:</span>
                                <span>{bracketStatus?.deadlineFormatted || 'Not set'}</span>
                            </div>
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
                <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <TabsTrigger value="bracket" className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Bracket
                    </TabsTrigger>
                    <TabsTrigger value="standings" className="flex items-center gap-2">
                        <Trophy className="h-4 w-4" />
                        Standings
                    </TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="admin" className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
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
                        dataManager={dataManager}
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
                            dataManager={dataManager}
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
