import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Trophy, Target, Clock, CheckCircle2, AlertCircle, Save, Edit3, X, Check } from 'lucide-react';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { getDb } from '../../../services/db/index.js';
import { ScrollHint } from '../ui/scroll-hint';

/**
 * Bracket matchup slot component
 */
const BracketSlot = ({
    matchupId,
    team1,
    team2,
    selectedTeam,
    actualWinner,
    onSelect,
    disabled,
    showResult,
    user,
    isAdmin,
    teamOwnerNames,
    className
}) => {
    const isTeam1Selected = selectedTeam?.id === team1?.id;
    const isTeam2Selected = selectedTeam?.id === team2?.id;
    const isTeam1Winner = actualWinner?.id === team1?.id;
    const isTeam2Winner = actualWinner?.id === team2?.id;
    const isCorrect = selectedTeam && actualWinner && selectedTeam.id === actualWinner.id;

    // Status tokens rather than raw light tints. `bg-green-50 text-green-800`
    // on this dark page rendered only because globals.css remaps those exact
    // selectors, and the selected state was a solid fill that made the team
    // name white-on-blue while every other slot stayed on the card colour.
    const getTeamStyle = (team, isSelected, isWinner) => {
        if (showResult && isWinner) {
            return isSelected
                ? 'border-success bg-success/20 text-success font-semibold'
                : 'border-success/50 bg-success/10 text-success';
        }
        if (showResult && isSelected && !isWinner) {
            return 'border-destructive/50 bg-destructive/10 text-destructive line-through';
        }
        if (isSelected) {
            return 'border-primary bg-primary/10 font-semibold';
        }
        return 'border-border hover:border-foreground/30 hover:bg-accent/50';
    };

    return (
        <div
            role="radiogroup"
            aria-label="Pick the winner of this matchup"
            className={`flex min-w-[180px] flex-col gap-1 rounded-lg border bg-card p-2 ${className || ''}`}
        >
            {/* Team 1 */}
            <button
                type="button"
                role="radio"
                aria-checked={isTeam1Selected}
                onClick={() => team1 && onSelect(matchupId, team1)}
                disabled={disabled || !team1}
                className={`
          flex items-center justify-center p-3 rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${team1 ? getTeamStyle(team1, isTeam1Selected, isTeam1Winner) : 'border-dashed border-muted bg-muted/20'}
          ${disabled || !team1 ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
            >
                <div className="text-center w-full">
                    <div className="font-medium text-sm truncate">
                        {team1 ? getMaskedTeamName(team1, user, isAdmin, teamOwnerNames) : 'TBD'}
                    </div>
                    {team1 && (
                        <div className="truncate text-xs text-muted-foreground">
                            {getMaskedOwnerName(team1, user, isAdmin, teamOwnerNames)}
                        </div>
                    )}
                </div>
            </button>

            <div className="text-center text-xs text-muted-foreground font-medium">vs</div>

            {/* Team 2 */}
            <button
                type="button"
                role="radio"
                aria-checked={isTeam2Selected}
                onClick={() => team2 && onSelect(matchupId, team2)}
                disabled={disabled || !team2}
                className={`
          flex items-center justify-center p-3 rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${team2 ? getTeamStyle(team2, isTeam2Selected, isTeam2Winner) : 'border-dashed border-muted bg-muted/20'}
          ${disabled || !team2 ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
            >
                <div className="text-center w-full">
                    <div className="font-medium text-sm truncate">
                        {team2 ? getMaskedTeamName(team2, user, isAdmin, teamOwnerNames) : 'TBD'}
                    </div>
                    {team2 && (
                        <div className="truncate text-xs text-muted-foreground">
                            {getMaskedOwnerName(team2, user, isAdmin, teamOwnerNames)}
                        </div>
                    )}
                </div>
            </button>

            {/* Result indicator */}
            {showResult && selectedTeam && (
                <div
                    className={`mt-1 flex items-center justify-center gap-1 text-xs font-medium ${
                        isCorrect ? 'text-success' : 'text-destructive'
                    }`}
                >
                    {isCorrect ? (
                        <Check className="h-3 w-3" aria-hidden="true" />
                    ) : (
                        <X className="h-3 w-3" aria-hidden="true" />
                    )}
                    {isCorrect ? 'Correct' : 'Wrong'}
                </div>
            )}
        </div>
    );
};

/**
 * Bye slot component - shows team with a bye (no opponent)
 */
const ByeSlot = ({ team, user, isAdmin, teamOwnerNames, className }) => {
    return (
        <div className={`flex min-w-[180px] flex-col gap-1 rounded-lg border bg-card p-2 ${className || ''}`}>
            <div className="flex items-center justify-center rounded-md border-2 border-success/50 bg-success/10 p-3">
                <div className="w-full text-center">
                    <div className="truncate text-sm font-medium text-success">
                        {team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'TBD'}
                    </div>
                    {team && (
                        <div className="truncate text-xs text-success/80">
                            {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
                        </div>
                    )}
                </div>
            </div>
            <div className="text-center text-xs font-medium text-success">Bye</div>
        </div>
    );
};


/**
 * Main bracket visualization component
 */
const PlayoffsBracket = ({
    season,
    playoffGames = [],
    userPicks = [],
    bracketStatus,
    onSubmitPicks,
    loading = false,
    user = null,
    isAdmin = false,
    teamOwnerNames = [],
}) => {
    const [picks, setPicks] = useState({});
    const [hasChanges, setHasChanges] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [divisions, setDivisions] = useState([]);
    const [championshipPointTotal, setChampionshipPointTotal] = useState('');

    // Load divisions
    useEffect(() => {
        const loadDivisions = async () => {
            if (!season?.id) return;
            try {
                const divs = await getDb().divisions.getDivisions(season.id);
                setDivisions(divs || []);
            } catch (err) {
                console.error('Error loading divisions:', err);
            }
        };
        loadDivisions();
    }, [season?.id]);

    // Initialize picks from existing user picks
    useEffect(() => {
        if (userPicks && userPicks.length > 0) {
            const existingPicks = {};
            let championshipTotal = '';
            userPicks.forEach(pick => {
                existingPicks[pick.matchupId] = {
                    predictedWinnerTeamId: pick.predictedWinnerTeamId,
                    predictedWinner: pick.predictedWinner,
                    gameId: pick.gameId
                };
                // Load championship point total from championship matchup
                if (pick.matchupId === 'championship' && pick.championshipPointTotal) {
                    championshipTotal = pick.championshipPointTotal.toString();
                }
            });
            setPicks(existingPicks);
            setChampionshipPointTotal(championshipTotal);
            setHasSubmitted(true);
            setIsEditing(false);
            setHasChanges(false);
        } else {
            setPicks({});
            setChampionshipPointTotal('');
            setHasSubmitted(false);
        }
    }, [userPicks]);

    // Handle pick selection
    const handlePickChange = useCallback((matchupId, team, gameId = null) => {
        setPicks(prev => ({
            ...prev,
            [matchupId]: {
                predictedWinnerTeamId: team.id,
                predictedWinner: team,
                gameId
            }
        }));
        setHasChanges(true);
        setError(null);
        setShowConfirmation(false);
    }, []);

    // Handle submission
    const handleSubmit = async () => {
        const picksArray = Object.entries(picks).map(([matchupId, pick]) => {
            const pickData = {
                matchup_id: matchupId,
                predicted_winner_team_id: pick.predictedWinnerTeamId,
                game_id: pick.gameId
            };
            // Add championship point total to the championship matchup
            if (matchupId === 'championship') {
                pickData.championship_point_total = parseFloat(championshipPointTotal);
            }
            return pickData;
        });

        if (picksArray.length === 0) {
            setError('Please make at least one pick');
            return;
        }

        if (!championshipPointTotal || isNaN(parseFloat(championshipPointTotal)) || parseFloat(championshipPointTotal) <= 0) {
            setError('Please enter a valid championship point total');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await onSubmitPicks(picksArray, parseFloat(championshipPointTotal));
            setHasChanges(false);
            setHasSubmitted(true);
            setIsEditing(false);
            setShowConfirmation(true);
            setTimeout(() => setShowConfirmation(false), 5000);
        } catch (err) {
            setError(err.message || 'Failed to submit picks');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelEdit = () => {
        // Reset to original picks
        if (userPicks && userPicks.length > 0) {
            const originalPicks = {};
            let championshipTotal = '';
            userPicks.forEach(pick => {
                originalPicks[pick.matchupId] = {
                    predictedWinnerTeamId: pick.predictedWinnerTeamId,
                    predictedWinner: pick.predictedWinner,
                    gameId: pick.gameId
                };
                // Reset championship point total
                if (pick.matchupId === 'championship' && pick.championshipPointTotal) {
                    championshipTotal = pick.championshipPointTotal.toString();
                }
            });
            setPicks(originalPicks);
            setChampionshipPointTotal(championshipTotal);
        } else {
            setPicks({});
            setChampionshipPointTotal('');
        }
        setIsEditing(false);
        setHasChanges(false);
        setError(null);
    };

    const handleStartEdit = () => {
        setIsEditing(true);
    };

    // Organize games by bracket position

    const organizeGames = () => {
        const playoffs = {
            div1: { r1: null, semi: null, bye: null },
            div2: { r1: null, semi: null, bye: null },
            championship: null,
            thirdPlace: null,
            fifthPlace: [] // Week 16 and 17
        };
        const consolation = {
            // Double-elimination structure
            winnersR1: [], // Quarterfinals (Week 15)
            winnersSemi: [], // Winners semifinals (Week 16)
            losersSemi: [], // Losers semifinals (Week 16) - teams that lost in R1
            losersR2: [], // Losers round 2 (Week 16) - more teams
            losersFinals: null, // Losers finals (Week 17)
            grandFinals: null // Grand finals (Week 17)
        };

        playoffGames.forEach(game => {
            const type = game.type;

            // Handle playoff bracket
            if (type === 'bye') {
                if (!playoffs.div1.bye) playoffs.div1.bye = game;
                else playoffs.div2.bye = game;
            } else if (type === 'playoff_first_round' || type === 'playoff_quarterfinals') {
                if (game.week === 15) {
                    if (!playoffs.div1.r1) playoffs.div1.r1 = game;
                    else playoffs.div2.r1 = game;
                }
            } else if (type === 'playoff_semifinals') {
                if (!playoffs.div1.semi) playoffs.div1.semi = game;
                else playoffs.div2.semi = game;
            } else if (type === 'playoff_championship') {
                playoffs.championship = game;
            } else if (type === 'playoff_third_place') {
                playoffs.thirdPlace = game;
            } else if (type === 'playoff_fifth_place') {
                playoffs.fifthPlace.push(game);
            }


            // Handle consolation bracket (double elimination)
            else if (type === 'playoff_consolation_quarterfinals') {
                consolation.winnersR1.push(game);
            } else if (type === 'playoff_consolation_semifinals') {
                // Determine if this is winner's or loser's semifinal
                // For now, we'll organize by index
                if (consolation.winnersSemi.length < 2) {
                    consolation.winnersSemi.push(game);
                } else {
                    consolation.losersSemi.push(game);
                }
            } else if (type === 'playoff_consolation_losers_round') {
                consolation.losersR2.push(game);
            } else if (type === 'playoff_consolation_losers_finals') {
                consolation.losersFinals = game;
            } else if (type === 'playoff_consolation_championship') {
                consolation.grandFinals = game;
            }
        });

        // Sort consolation R1 games by slot (0-3)
        consolation.winnersR1.sort((a, b) => {
            const slotA = a.slot !== null && a.slot !== undefined ? a.slot : 999;
            const slotB = b.slot !== null && b.slot !== undefined ? b.slot : 999;
            return slotA - slotB;
        });

        return { playoffs, consolation };

    };

    const { playoffs, consolation } = organizeGames();
    const canEdit = bracketStatus?.canSubmit && user;
    const showResult = bracketStatus?.resultsReleased;

    // Calculate derived teams based on picks (March Madness style + losers)

    // PLAYOFF BRACKET
    // Division 1: Get Round 1 winner and loser
    const div1R1Winner = picks['div1_r1']?.predictedWinner;
    const div1R1Loser = playoffs.div1.r1?.team1?.id === div1R1Winner?.id
        ? playoffs.div1.r1?.team2
        : playoffs.div1.r1?.team1;

    // Division 1: Round 2 teams
    const div1SemiTeam1 = playoffs.div1.bye?.team1; // #1 seed
    const div1SemiTeam2 = div1R1Winner;

    // Division 2: Get Round 1 winner and loser
    const div2R1Winner = picks['div2_r1']?.predictedWinner;
    const div2R1Loser = playoffs.div2.r1?.team1?.id === div2R1Winner?.id
        ? playoffs.div2.r1?.team2
        : playoffs.div2.r1?.team1;

    // Division 2: Round 2 teams
    const div2SemiTeam1 = playoffs.div2.bye?.team1; // #1 seed
    const div2SemiTeam2 = div2R1Winner;

    // Get semifinal winners and losers
    const div1SemiWinner = picks['div1_semi']?.predictedWinner;
    const div1SemiLoser = div1SemiTeam1?.id === div1SemiWinner?.id
        ? div1SemiTeam2
        : div1SemiTeam1;

    const div2SemiWinner = picks['div2_semi']?.predictedWinner;
    const div2SemiLoser = div2SemiTeam1?.id === div2SemiWinner?.id
        ? div2SemiTeam2
        : div2SemiTeam1;

    // Championship teams
    const champTeam1 = div1SemiWinner;
    const champTeam2 = div2SemiWinner;

    // 3rd place teams (losers of semifinals)
    const thirdPlaceTeam1 = div1SemiLoser;
    const thirdPlaceTeam2 = div2SemiLoser;

    // 5th place teams (losers of first round)
    const fifthPlaceTeam1 = div1R1Loser;
    const fifthPlaceTeam2 = div2R1Loser;

    // CONSOLATION BRACKET - LADDER SYSTEM
    // Winners move UP (to lower slot numbers), Losers move DOWN (to higher slot numbers)

    // Round 1 (Week 15) - 4 games → 4 winners, 4 losers
    // Use slot to identify position, not array index
    const conR1Winners = [0, 1, 2, 3].map(i => {
        const game = consolation.winnersR1.find(g => g.slot === i) || consolation.winnersR1[i];
        return picks[`con_r1_${i}`]?.predictedWinner;
    });

    const conR1Losers = [0, 1, 2, 3].map(i => {
        const game = consolation.winnersR1.find(g => g.slot === i) || consolation.winnersR1[i];
        const winner = conR1Winners[i];
        if (!winner || !game) return null;
        return game.team1?.id === winner.id ? game.team2 : game.team1;
    });

    // Round 2 (Week 16) - Ladder pairings
    // Slot 0: Winner of R1-Slot0 vs Winner of R1-Slot1 (top two winners face off)
    // Slot 1: Loser of R1-Slot0 vs Winner of R1-Slot2 (R1-0 loser drops 1, R1-2 winner climbs 1)
    // Slot 2: Loser of R1-Slot1 vs Winner of R1-Slot3 (R1-1 loser drops 1, R1-3 winner climbs 1)
    // Slot 3: Loser of R1-Slot2 vs Loser of R1-Slot3 (bottom two losers face off)
    const conR2Winners = [0, 1, 2, 3].map(i => picks[`con_r2_${i}`]?.predictedWinner);
    const conR2Losers = [0, 1, 2, 3].map(i => {
        // Determine teams in this R2 matchup based on ladder logic
        let team1, team2;
        if (i === 0) {
            team1 = conR1Winners[0]; // Winner of slot 0 stays at top
            team2 = conR1Winners[1]; // Winner of slot 1 stays near top
        } else if (i === 1) {
            team1 = conR1Losers[0]; // Loser of slot 0 drops 1
            team2 = conR1Winners[2]; // Winner of slot 2 climbs 1
        } else if (i === 2) {
            team1 = conR1Losers[1]; // Loser of slot 1 drops 1
            team2 = conR1Winners[3]; // Winner of slot 3 climbs 1
        } else { // i === 3
            team1 = conR1Losers[2]; // Loser of slot 2 drops 1
            team2 = conR1Losers[3]; // Loser of slot 3 stays at bottom
        }

        const winner = conR2Winners[i];
        if (!winner || !team1 || !team2) return null;
        return team1.id === winner.id ? team2 : team1;
    });


    // Round 3 (Week 17) - Ladder pairings (same pattern)
    // Slot 0: Winner of R2-Slot0 vs Winner of R2-Slot1
    // Slot 1: Loser of R2-Slot0 vs Winner of R2-Slot2
    // Slot 2: Loser of R2-Slot1 vs Winner of R2-Slot3
    // Slot 3: Loser of R2-Slot2 vs Loser of R2-Slot3
    const conR3Winners = [0, 1, 2, 3].map(i => picks[`con_r3_${i}`]?.predictedWinner);

    // Calculate total matchups and picks for validation
    const totalMatchups =
        2 + // Playoff R1 (div1_r1, div2_r1)
        2 + // Playoff Semifinals (div1_semi, div2_semi)
        1 + // Championship
        1 + // 3rd place
        2 + // 5th place (Week 16 & 17)
        4 + // Consolation R1 (con_r1_0 to con_r1_3)
        4 + // Consolation R2 (con_r2_0 to con_r2_3)
        4;  // Consolation R3 (con_r3_0 to con_r3_3)

    const picksCount = Object.keys(picks).length;
    const hasChampionshipTotal = championshipPointTotal !== '' && !isNaN(parseFloat(championshipPointTotal)) && parseFloat(championshipPointTotal) > 0;
    const allPicksMade = picksCount >= totalMatchups && hasChampionshipTotal;

    // Get pick for a matchup
    const getPick = (matchupId) => {
        const pick = picks[matchupId];
        return pick?.predictedWinner || null;
    };

    // Get actual winner for a game
    const getActualWinner = (game) => {
        if (!game || !game.winnerTeamId) return null;
        if (game.winnerTeamId === game.team1?.id) return game.team1;
        if (game.winnerTeamId === game.team2?.id) return game.team2;
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Status Bar */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-orange-600" />
                                <span className="font-medium">
                                    {hasSubmitted && !isEditing ? 'Your Picks Submitted' : 'Make Your Picks'}
                                </span>
                            </div>

                            {hasSubmitted && !isEditing && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Submitted
                                </Badge>
                            )}

                            {isEditing && hasChanges && (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                    Changes Made
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div>
                                    <div className="font-medium">Ready to submit?</div>
                                    <div className="text-sm text-muted-foreground">
                                        {picksCount}/{totalMatchups} matchups selected
                                        {!allPicksMade && (
                                            <span className="text-orange-600 ml-1">
                                                ({totalMatchups - picksCount} remaining)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {!user ? (
                                <div className="text-sm text-muted-foreground px-4 py-2 bg-yellow-50 border border-yellow-200 rounded">
                                    Please log in to submit picks
                                </div>
                            ) : canEdit ? (
                                hasSubmitted && !isEditing ? (
                                    <>
                                        <Button onClick={handleStartEdit} variant="outline">
                                            <Edit3 className="h-4 w-4 mr-2" />
                                            Edit Picks
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        {isEditing && (
                                            <Button onClick={handleCancelEdit} variant="outline">
                                                <X className="h-4 w-4 mr-2" />
                                                Cancel
                                            </Button>
                                        )}
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={submitting || !allPicksMade}
                                            className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {submitting ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                                    Submitting...
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="h-4 w-4 mr-2" />
                                                    {allPicksMade ? 'Submit Picks' : `Select ${totalMatchups - picksCount} More`}
                                                </>
                                            )}
                                        </Button>
                                    </>
                                )
                            ) : (
                                <Badge variant="secondary">Submissions Closed</Badge>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Description/Info Blurb */}
            <Card>
                <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground space-y-2">
                        <p>
                            This is a March Madness style bracket challenge. Select all matchups to submit your picks. Each correct pick receives 1 point, and the championship combined point total prediction receives 3 bonus points for the closest prediction.
                            Highest bracket point total wins $20 FAAB for next year!

                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Confirmation */}
            {showConfirmation && (
                <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                        Your bracket picks have been saved! You can edit them until the deadline.
                    </AlertDescription>
                </Alert>
            )}

            {/* Error */}
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Playoff Bracket */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        Playoff Bracket
                    </CardTitle>
                    <CardDescription>The top 3 seeds from each division!</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-8">
                        {/* Main Tournament */}
                        {/*
                            `justify-center` on a horizontally scrolling flex
                            container puts the overflow at the *start* of the
                            line, and negative scroll offset is unreachable —
                            so at any width narrower than the bracket, round 1
                            simply could not be seen. `w-max mx-auto` centres
                            the bracket when it fits and left-aligns it when it
                            does not, which is what centring was meant to do.
                        */}
                        <ScrollHint className="pb-4">
                          <div className="mx-auto flex w-max items-start gap-6">
                            {/* Division 2 (Left Side) */}
                            <div className="flex flex-col gap-6">
                                <div className="text-center font-semibold text-sm text-muted-foreground mb-2">
                                    {divisions[0]?.name || 'Division 1'}
                                </div>

                                {/* Week 15 Column */}
                                <div className="flex flex-col gap-4">
                                    <div className="text-xs text-muted-foreground text-center">Week 15</div>
                                    {/* #1 Seed BYE */}
                                    <ByeSlot
                                        team={playoffs.div2.bye?.team1}
                                        user={user}
                                        isAdmin={isAdmin}
                                        teamOwnerNames={teamOwnerNames}
                                    />
                                    {/* #2 vs #3 */}
                                    <BracketSlot
                                        matchupId="div2_r1"
                                        className="ff-feeds-forward"
                                        team1={playoffs.div2.r1?.team1}
                                        team2={playoffs.div2.r1?.team2}
                                        selectedTeam={getPick('div2_r1')}
                                        actualWinner={getActualWinner(playoffs.div2.r1)}
                                        onSelect={(id, team) => handlePickChange(id, team, playoffs.div2.r1?.id)}
                                        disabled={!canEdit || (hasSubmitted && !isEditing)}
                                        showResult={showResult}
                                        user={user}
                                        isAdmin={isAdmin}
                                        teamOwnerNames={teamOwnerNames}
                                    />
                                </div>
                            </div>

                            {/* Week 16 - Semifinal */}
                            <div className="flex flex-col gap-6">
                                <div className="text-center text-xs text-muted-foreground mb-2">Week 16</div>
                                <BracketSlot
                                    matchupId="div2_semi"
                                        className="ff-fed-from-left ff-feeds-forward"
                                    team1={div2SemiTeam1}
                                    team2={div2SemiTeam2}
                                    selectedTeam={getPick('div2_semi')}
                                    actualWinner={getActualWinner(playoffs.div2.semi)}
                                    onSelect={(id, team) => handlePickChange(id, team, playoffs.div2.semi?.id)}
                                    disabled={!canEdit || (hasSubmitted && !isEditing)}
                                    showResult={showResult}
                                    user={user}
                                    isAdmin={isAdmin}
                                    teamOwnerNames={teamOwnerNames}
                                />
                            </div>

                            {/* Championship (Center) */}
                            <div className="flex flex-col gap-6">
                                <div className="text-center font-semibold text-sm mb-2">
                                    <Trophy className="h-4 w-4 inline mr-1 text-yellow-500" />
                                    Week 17
                                </div>
                                <div className="text-xs text-muted-foreground mb-2 text-center">Championship</div>
                                <BracketSlot
                                    matchupId="championship"
                                        className="ff-fed-from-left"
                                    team1={champTeam1}
                                    team2={champTeam2}
                                    selectedTeam={getPick('championship')}
                                    actualWinner={getActualWinner(playoffs.championship)}
                                    onSelect={(id, team) => handlePickChange(id, team, playoffs.championship?.id)}
                                    disabled={!canEdit || (hasSubmitted && !isEditing)}
                                    showResult={showResult}
                                    user={user}
                                    isAdmin={isAdmin}
                                    teamOwnerNames={teamOwnerNames}
                                />

                                {/* Championship Point Total Prediction */}
                                <div className="flex flex-col gap-2 p-3 bg-card rounded-lg border shadow-sm min-w-[180px]">
                                    <div className="text-xs font-semibold text-center text-muted-foreground">
                                        Championship Combined Point Total
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={championshipPointTotal}
                                        onChange={(e) => {
                                            setChampionshipPointTotal(e.target.value);
                                            setHasChanges(true);
                                            setError(null);
                                        }}
                                        disabled={!canEdit || (hasSubmitted && !isEditing)}
                                        placeholder="Enter total points (e.g., 124.34)"
                                        className={`
                                            w-full px-3 py-2 text-center font-medium rounded-md border-2 transition-all
                                            ${championshipPointTotal ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-muted'}
                                            ${!canEdit || (hasSubmitted && !isEditing) ? 'cursor-not-allowed bg-muted/20' : 'focus:outline-none focus:ring-2 focus:ring-blue-500'}
                                            disabled:opacity-50
                                        `}
                                    />
                                    <div className="text-xs text-center text-muted-foreground">
                                        3 bonus points for closest prediction
                                    </div>
                                </div>
                            </div>

                            {/* Week 16 - Semifinal */}
                            <div className="flex flex-col gap-6">
                                <div className="text-center text-xs text-muted-foreground mb-2">Week 16</div>
                                <BracketSlot
                                    matchupId="div1_semi"
                                        className="ff-fed-from-left"
                                    team1={div1SemiTeam1}
                                    team2={div1SemiTeam2}
                                    selectedTeam={getPick('div1_semi')}
                                    actualWinner={getActualWinner(playoffs.div1.semi)}
                                    onSelect={(id, team) => handlePickChange(id, team, playoffs.div1.semi?.id)}
                                    disabled={!canEdit || (hasSubmitted && !isEditing)}
                                    showResult={showResult}
                                    user={user}
                                    isAdmin={isAdmin}
                                    teamOwnerNames={teamOwnerNames}
                                />
                            </div>

                            {/* Division 1 (Right Side) */}
                            <div className="flex flex-col gap-6">
                                <div className="text-center font-semibold text-sm text-muted-foreground mb-2">
                                    {divisions[1]?.name || 'Division 2'}
                                </div>

                                {/* Week 15 Column */}
                                <div className="flex flex-col gap-4">
                                    <div className="text-xs text-muted-foreground text-center">Week 15</div>
                                    {/* #1 Seed BYE */}
                                    <ByeSlot
                                        team={playoffs.div1.bye?.team1}
                                        user={user}
                                        isAdmin={isAdmin}
                                        teamOwnerNames={teamOwnerNames}
                                    />
                                    {/* #2 vs #3 */}
                                    <BracketSlot
                                        matchupId="div1_r1"
                                        className="ff-feeds-forward"
                                        team1={playoffs.div1.r1?.team1}
                                        team2={playoffs.div1.r1?.team2}
                                        selectedTeam={getPick('div1_r1')}
                                        actualWinner={getActualWinner(playoffs.div1.r1)}
                                        onSelect={(id, team) => handlePickChange(id, team, playoffs.div1.r1?.id)}
                                        disabled={!canEdit || (hasSubmitted && !isEditing)}
                                        showResult={showResult}
                                        user={user}
                                        isAdmin={isAdmin}
                                        teamOwnerNames={teamOwnerNames}
                                    />
                                </div>
                            </div>
                        </div>
                        </ScrollHint>

                        {/* Consolation Games - 3rd and 5th Place */}
                        <div className="border-t pt-6">
                            <div className="text-center text-sm font-semibold text-muted-foreground mb-4">
                                Consolation Games
                            </div>
                            <div className="flex items-center justify-center gap-8">
                                {/* 5th Place - Week 16 & 17 */}
                                <div className="flex flex-col gap-4">
                                    <div className="text-xs text-muted-foreground text-center font-medium">
                                        5th Place (Losers of R1)
                                    </div>
                                    <div className="flex gap-4">
                                        {/* Week 16 */}
                                        <div>
                                            <div className="text-xs text-muted-foreground text-center mb-2">Week 16</div>
                                            <BracketSlot
                                                matchupId="fifth_place_wk16"
                                                team1={div1R1Winner ? fifthPlaceTeam1 : null}
                                                team2={div2R1Winner ? fifthPlaceTeam2 : null}
                                                selectedTeam={getPick('fifth_place_wk16')}
                                                actualWinner={getActualWinner(playoffs.fifthPlace[0])}
                                                onSelect={(id, team) => handlePickChange(id, team, playoffs.fifthPlace[0]?.id)}
                                                disabled={!canEdit || (hasSubmitted && !isEditing)}
                                                showResult={showResult}
                                                user={user}
                                                isAdmin={isAdmin}
                                                teamOwnerNames={teamOwnerNames}
                                            />
                                        </div>
                                        {/* Week 17 */}
                                        <div>
                                            <div className="text-xs text-muted-foreground text-center mb-2">Week 17</div>
                                            <BracketSlot
                                                matchupId="fifth_place_wk17"
                                                team1={div1R1Winner ? fifthPlaceTeam1 : null}
                                                team2={div2R1Winner ? fifthPlaceTeam2 : null}
                                                selectedTeam={getPick('fifth_place_wk17')}
                                                actualWinner={getActualWinner(playoffs.fifthPlace[1])}
                                                onSelect={(id, team) => handlePickChange(id, team, playoffs.fifthPlace[1]?.id)}
                                                disabled={!canEdit || (hasSubmitted && !isEditing)}
                                                showResult={showResult}
                                                user={user}
                                                isAdmin={isAdmin}
                                                teamOwnerNames={teamOwnerNames}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 3rd Place - Week 17 */}
                                <div className="flex flex-col gap-4">
                                    <div className="text-xs text-muted-foreground text-center font-medium">
                                        3rd Place (Losers of Semifinals)
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground text-center mb-2">Week 17</div>
                                        <BracketSlot
                                            matchupId="third_place"
                                            team1={div1SemiWinner ? thirdPlaceTeam1 : null}
                                            team2={div2SemiWinner ? thirdPlaceTeam2 : null}
                                            selectedTeam={getPick('third_place')}
                                            actualWinner={getActualWinner(playoffs.thirdPlace)}
                                            onSelect={(id, team) => handlePickChange(id, team, playoffs.thirdPlace?.id)}
                                            disabled={!canEdit || (hasSubmitted && !isEditing)}
                                            showResult={showResult}
                                            user={user}
                                            isAdmin={isAdmin}
                                            teamOwnerNames={teamOwnerNames}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Consolation Bracket */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Consolation Bracket
                    </CardTitle>
                    <CardDescription>8 teams compete across 3 weeks</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollHint className="pb-4">
                      <div className="mx-auto flex w-max items-start gap-8">
                        {/* Week 15 - Round 1 (4 matchups) */}
                        <div className="flex flex-col gap-3">
                            <div className="text-center text-xs text-muted-foreground font-semibold mb-2">
                                Round 1 | Week 15
                            </div>
                            {[0, 1, 2, 3].map((index) => (
                                <BracketSlot
                                    key={index}
                                    matchupId={`con_r1_${index}`}
                                    team1={consolation.winnersR1[index]?.team1}
                                    team2={consolation.winnersR1[index]?.team2}
                                    selectedTeam={getPick(`con_r1_${index}`)}
                                    actualWinner={getActualWinner(consolation.winnersR1[index])}
                                    onSelect={(id, team) => handlePickChange(id, team, consolation.winnersR1[index]?.id)}
                                    disabled={!canEdit || (hasSubmitted && !isEditing)}
                                    showResult={showResult}
                                    user={user}
                                    isAdmin={isAdmin}
                                    teamOwnerNames={teamOwnerNames}
                                />
                            ))}
                        </div>

                        {/* Week 16 - Round 2 (4 matchups) */}
                        <div className="flex flex-col gap-3">
                            <div className="text-center text-xs text-muted-foreground font-semibold mb-2">
                                Round 2 | Week 16
                            </div>
                            {[0, 1, 2, 3].map((index) => {
                                // LADDER LOGIC: Winners climb up, Losers drop down
                                // Slot 0: W(R1-0) vs W(R1-1) - top winners
                                // Slot 1: L(R1-0) vs W(R1-2) - R1-0 loser drops 1, R1-2 winner climbs 1
                                // Slot 2: L(R1-1) vs W(R1-3) - R1-1 loser drops 1, R1-3 winner climbs 1
                                // Slot 3: L(R1-2) vs L(R1-3) - bottom losers
                                let team1, team2;
                                if (index === 0) {
                                    team1 = conR1Winners[0];
                                    team2 = conR1Winners[1];
                                } else if (index === 1) {
                                    team1 = conR1Losers[0];
                                    team2 = conR1Winners[2];
                                } else if (index === 2) {
                                    team1 = conR1Losers[1];
                                    team2 = conR1Winners[3];
                                } else { // index === 3
                                    team1 = conR1Losers[2];
                                    team2 = conR1Losers[3];
                                }

                                return (
                                    <BracketSlot
                                        key={index}
                                        matchupId={`con_r2_${index}`}
                                        team1={team1}
                                        team2={team2}
                                        selectedTeam={getPick(`con_r2_${index}`)}
                                        actualWinner={null}
                                        onSelect={(id, team) => handlePickChange(id, team, null)}
                                        disabled={!canEdit || (hasSubmitted && !isEditing)}
                                        showResult={showResult}
                                        user={user}
                                        isAdmin={isAdmin}
                                        teamOwnerNames={teamOwnerNames}
                                    />
                                );
                            })}
                        </div>

                        {/* Week 17 - Round 3 (4 matchups) */}
                        <div className="flex flex-col gap-3">
                            <div className="text-center text-xs text-muted-foreground font-semibold mb-2">
                                Round 3 | Week 17
                            </div>
                            {[0, 1, 2, 3].map((index) => {
                                // LADDER LOGIC: Winners climb up, Losers drop down
                                // Slot 0: W(R2-0) vs W(R2-1) - championship
                                // Slot 1: L(R2-0) vs W(R2-2) - R2-0 loser drops 1, R2-2 winner climbs 1
                                // Slot 2: L(R2-1) vs W(R2-3) - R2-1 loser drops 1, R2-3 winner climbs 1
                                // Slot 3: L(R2-2) vs L(R2-3) - bottom game
                                let team1, team2;
                                if (index === 0) {
                                    team1 = conR2Winners[0];
                                    team2 = conR2Winners[1];
                                } else if (index === 1) {
                                    team1 = conR2Losers[0];
                                    team2 = conR2Winners[2];
                                } else if (index === 2) {
                                    team1 = conR2Losers[1];
                                    team2 = conR2Winners[3];
                                } else { // index === 3
                                    team1 = conR2Losers[2];
                                    team2 = conR2Losers[3];
                                }

                                return (
                                    <BracketSlot
                                        key={index}
                                        matchupId={`con_r3_${index}`}
                                        team1={team1}
                                        team2={team2}
                                        selectedTeam={getPick(`con_r3_${index}`)}
                                        actualWinner={null}
                                        onSelect={(id, team) => handlePickChange(id, team, null)}
                                        disabled={!canEdit || (hasSubmitted && !isEditing)}
                                        showResult={showResult}
                                        user={user}
                                        isAdmin={isAdmin}
                                        teamOwnerNames={teamOwnerNames}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    </ScrollHint>
                </CardContent>
            </Card>

            {/* Instructions */}
            {canEdit && (
                <Card>
                    <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground space-y-2">
                            <h4 className="font-medium text-foreground">How to Play:</h4>
                            <ul className="space-y-1 pl-4">
                                <li>• Click on a team to predict they will win that matchup</li>
                                <li>• Predict winners for as many matchups as you want</li>
                                <li>• Each correct pick earns 1 point</li>
                                <li>• You can edit your picks until {bracketStatus?.deadlineFormatted}</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default PlayoffsBracket;
