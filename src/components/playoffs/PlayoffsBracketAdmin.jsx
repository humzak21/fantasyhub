import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Users, Trophy, Settings, Clock, CheckCircle2 } from 'lucide-react';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import { getDb } from '../../../services/db/index.js';

const PlayoffsBracketAdmin = ({
    season,
    allPicks = [],
    standings = [],
    bracketStatus,
    onUpdate,
    loading = false,
    teamOwnerNames = [],
    playoffGames = []
}) => {
    const [releasing, setReleasing] = useState(false);

    // Filter consolation games (Week 15 only for initial assignment)
    const consolationGames = playoffGames.filter(game =>
        game.type === 'playoff_consolation_quarterfinals' && game.week === 15
    );

    // State for slot assignments (matchup ID to slot mapping)
    // Initialize from database slots, or default to game order
    const [slotAssignments, setSlotAssignments] = useState(() => {
        const assignments = { 0: null, 1: null, 2: null, 3: null };

        // Read existing slot assignments from database
        consolationGames.forEach(game => {
            if (game.slot !== null && game.slot !== undefined) {
                assignments[game.slot] = game.id;
            }
        });

        // If no slots are assigned yet, default to game order
        const hasAnySlots = Object.values(assignments).some(v => v !== null);
        if (!hasAnySlots) {
            consolationGames.forEach((game, index) => {
                if (index < 4) {
                    assignments[index] = game.id;
                }
            });
        }

        return assignments;
    });

    // Update slot assignments when playoffGames changes (e.g., after save)
    useEffect(() => {
        const assignments = { 0: null, 1: null, 2: null, 3: null };

        // Read existing slot assignments from database
        consolationGames.forEach(game => {
            if (game.slot !== null && game.slot !== undefined) {
                assignments[game.slot] = game.id;
            }
        });

        // If no slots are assigned yet, default to game order
        const hasAnySlots = Object.values(assignments).some(v => v !== null);
        if (!hasAnySlots) {
            consolationGames.forEach((game, index) => {
                if (index < 4) {
                    assignments[index] = game.id;
                }
            });
        }

        setSlotAssignments(assignments);
    }, [playoffGames]);


    // Helper to format matchup for display
    const formatMatchup = (game) => {
        if (!game) return 'No matchup';
        const team1 = getMaskedTeamName(game.team1, null, true, teamOwnerNames);
        const team2 = getMaskedTeamName(game.team2, null, true, teamOwnerNames);
        return `${team1} vs ${team2}`;
    };

    const handleSlotChange = (slot, gameId) => {
        setSlotAssignments(prev => ({
            ...prev,
            [slot]: gameId
        }));
    };

    const handleSaveAssignments = async () => {
        try {
            await getDb().playoffs.updateConsolationGameSlots(season.id, slotAssignments);
            alert('Slot assignments saved successfully!');
            if (onUpdate) {
                await onUpdate(); // Refresh data
            }
        } catch (error) {
            console.error('Failed to save slot assignments:', error);
            alert(`Failed to save: ${error.message}`);
        }
    };


    // Group picks by user
    const picksByUser = allPicks.reduce((acc, pick) => {
        const userId = pick.userId;
        if (!acc[userId]) {
            acc[userId] = {
                displayName: pick.displayName,
                picks: []
            };
        }
        acc[userId].picks.push(pick);
        return acc;
    }, {});

    const uniqueUsers = Object.keys(picksByUser).length;
    const totalPicks = allPicks.length;

    const handleReleaseResults = async () => {
        if (!window.confirm('Are you sure you want to release results? This will make all picks visible to everyone.')) {
            return;
        }

        setReleasing(true);
        try {
            await getDb().playoffs.releasePlayoffResults(season.id);
            await onUpdate();
        } catch (err) {
            console.error('Failed to release results:', err);
        } finally {
            setReleasing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Overview Stats */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Admin Overview
                    </CardTitle>
                    <CardDescription>
                        Manage bracket submissions and results
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-primary">{uniqueUsers}</div>
                            <div className="text-sm text-muted-foreground">Participants</div>
                        </div>
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-primary">{totalPicks}</div>
                            <div className="text-sm text-muted-foreground">Total Picks</div>
                        </div>
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-primary">
                                {bracketStatus?.canSubmit ? 'Open' : 'Closed'}
                            </div>
                            <div className="text-sm text-muted-foreground">Submissions</div>
                        </div>
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-primary">
                                {bracketStatus?.resultsReleased ? 'Yes' : 'No'}
                            </div>
                            <div className="text-sm text-muted-foreground">Results Released</div>
                        </div>
                    </div>

                    {/* Release Results Button */}
                    {!bracketStatus?.resultsReleased && (
                        <div className="flex justify-center">
                            <Button
                                onClick={handleReleaseResults}
                                disabled={releasing}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                <Trophy className="h-4 w-4 mr-2" />
                                {releasing ? 'Releasing...' : 'Release Results to Public'}
                            </Button>
                        </div>
                    )}

                    {bracketStatus?.resultsReleased && (
                        <div className="flex justify-center">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-base px-4 py-2">
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Results Have Been Released
                            </Badge>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Deadline Info */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Deadline Information
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div>
                            <div className="font-medium">Submission Deadline</div>
                            <div className="text-muted-foreground">
                                {bracketStatus?.deadlineFormatted || 'Not set'}
                            </div>
                        </div>
                        {bracketStatus?.canSubmit ? (
                            <Badge variant="default">
                                <Clock className="h-3 w-3 mr-1" />
                                {bracketStatus.timeRemaining}
                            </Badge>
                        ) : (
                            <Badge variant="secondary">Deadline Passed</Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* User Submissions */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        User Submissions ({uniqueUsers})
                    </CardTitle>
                    <CardDescription>
                        All bracket picks submitted by users
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {uniqueUsers === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-4" />
                            <p>No submissions yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(picksByUser).map(([userId, userData]) => {
                                const correctPicks = userData.picks.filter(p => p.isCorrect).length;
                                const totalUserPicks = userData.picks.length;
                                // Find championship pick to display point total
                                const championshipPick = userData.picks.find(p => p.matchupId === 'championship');

                                return (
                                    <div key={userId} className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                                    <Users className="h-4 w-4 text-primary" />
                                                </div>
                                                <div>
                                                    <div className="font-medium">{userData.displayName}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {totalUserPicks} picks submitted
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {championshipPick?.championshipPointTotal && (
                                                    <Badge variant="outline" className="bg-yellow-50 border-yellow-300">
                                                        <Trophy className="h-3 w-3 mr-1" />
                                                        {championshipPick.championshipPointTotal} pts
                                                    </Badge>
                                                )}
                                                {bracketStatus?.resultsReleased && (
                                                    <Badge variant="outline">
                                                        {correctPicks}/{totalUserPicks} correct
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                            {userData.picks.map((pick) => (
                                                <div
                                                    key={pick.id}
                                                    className={`text-sm p-2 rounded border ${pick.isCorrect === true
                                                        ? 'bg-green-50 border-green-200'
                                                        : pick.isCorrect === false
                                                            ? 'bg-red-50 border-red-200'
                                                            : 'bg-muted/50'
                                                        }`}
                                                >
                                                    <div className="text-xs text-muted-foreground mb-1">
                                                        {pick.matchupId}
                                                    </div>
                                                    <div className="font-medium truncate">
                                                        {pick.predictedWinner?.name || 'Unknown'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Consolation Bracket Slot Manager */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Consolation Bracket Seeding Configuration
                    </CardTitle>
                    <CardDescription>
                        Configure which seeds are assigned to which slots in Round 1 (Week 15). Ladder logic applies from Round 2 onward.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {/* Week 15 - Round 1 Matchup Assignment */}
                        <div>
                            <h4 className="font-semibold mb-3">Week 15 - Round 1 (Matchup Assignment)</h4>
                            <div className="text-sm text-muted-foreground mb-4">
                                Assign which consolation matchups appear in each slot. Higher-seeded matchups should be in Slot 0.
                            </div>

                            {consolationGames.length === 0 ? (
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        No consolation games found in database. Please create consolation matchups first.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {/* Slot 0 */}
                                    <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="outline" className="bg-white">Slot 0 (Highest Seeds)</Badge>
                                            <span className="text-xs text-muted-foreground">Best consolation matchup</span>
                                        </div>
                                        <select
                                            className="w-full p-2 text-sm border rounded bg-white"
                                            value={slotAssignments[0] || ''}
                                            onChange={(e) => handleSlotChange(0, e.target.value)}
                                        >
                                            <option value="">Select matchup...</option>
                                            {consolationGames.map(game => (
                                                <option key={game.id} value={game.id}>
                                                    {formatMatchup(game)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Slot 1 */}
                                    <div className="p-4 border rounded-lg bg-yellow-50 border-yellow-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="outline" className="bg-white">Slot 1</Badge>
                                        </div>
                                        <select
                                            className="w-full p-2 text-sm border rounded bg-white"
                                            value={slotAssignments[1] || ''}
                                            onChange={(e) => handleSlotChange(1, e.target.value)}
                                        >
                                            <option value="">Select matchup...</option>
                                            {consolationGames.map(game => (
                                                <option key={game.id} value={game.id}>
                                                    {formatMatchup(game)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Slot 2 */}
                                    <div className="p-4 border rounded-lg bg-orange-50 border-orange-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="outline" className="bg-white">Slot 2</Badge>
                                        </div>
                                        <select
                                            className="w-full p-2 text-sm border rounded bg-white"
                                            value={slotAssignments[2] || ''}
                                            onChange={(e) => handleSlotChange(2, e.target.value)}
                                        >
                                            <option value="">Select matchup...</option>
                                            {consolationGames.map(game => (
                                                <option key={game.id} value={game.id}>
                                                    {formatMatchup(game)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Slot 3 */}
                                    <div className="p-4 border rounded-lg bg-red-50 border-red-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="outline" className="bg-white">Slot 3 (Lowest Seeds)</Badge>
                                            <span className="text-xs text-muted-foreground">Worst consolation matchup</span>
                                        </div>
                                        <select
                                            className="w-full p-2 text-sm border rounded bg-white"
                                            value={slotAssignments[3] || ''}
                                            onChange={(e) => handleSlotChange(3, e.target.value)}
                                        >
                                            <option value="">Select matchup...</option>
                                            {consolationGames.map(game => (
                                                <option key={game.id} value={game.id}>
                                                    {formatMatchup(game)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex justify-end">
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700"
                                    onClick={handleSaveAssignments}
                                    disabled={!consolationGames.length}
                                >
                                    <Settings className="h-4 w-4 mr-2" />
                                    Save Matchup Assignments
                                </Button>
                            </div>
                        </div>

                        {/* Week 16 - Round 2 (Ladder Logic) */}
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-semibold mb-2">Week 16 & 17 - Automatic Ladder Logic</h4>
                            <p className="text-sm text-blue-900 mb-2">
                                After Round 1, teams advance automatically based on the ladder system:
                            </p>
                            <ul className="text-sm text-blue-800 space-y-1 ml-4">
                                <li>• <strong>Winners climb UP</strong> to lower slot numbers (toward Slot 0)</li>
                                <li>• <strong>Losers drop DOWN</strong> to higher slot numbers (toward Slot 3)</li>
                                <li>• Teams face opponents of similar performance each week</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PlayoffsBracketAdmin;
