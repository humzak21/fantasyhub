import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { EmptyState } from '../ui/empty-state';
import RouteLoading from '../layout/RouteLoading';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useAwards, useAwardResults, useAwardBallotSeasons } from '../../../hooks/queries/index.js';
import { viewableResultSeasons } from './resultsAccess.js';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

/**
 * The ballot results, for any season that has one.
 *
 * This used to fetch the active season's tallies in a `useEffect` and take its
 * award list as a prop from `AwardsManager`, which is why a season becoming
 * inactive took its pie charts with it — the rows stayed public-read in
 * PostgREST the whole time, only the UI had lost the way in. It now owns a
 * season of its own: `selectedSeasonId` drives both fetches, and the picker
 * lists exactly the seasons `viewableResultSeasons` allows.
 *
 * The presentation is deliberately unchanged. Browsing 2025 shows what 2025
 * showed while it was live.
 */
const AwardsResults = ({ activeSeasonId, activeSeasonResultsReleased = false, isAdmin = false }) => {
    const { data: ballotSeasons, isPending: seasonsPending } = useAwardBallotSeasons();

    const seasons = useMemo(
        () => viewableResultSeasons(ballotSeasons, { isAdmin, activeSeasonResultsReleased }),
        [ballotSeasons, isAdmin, activeSeasonResultsReleased]
    );

    // Null until the viewer picks. Resolving the default here rather than in an
    // effect means there is no render where the id is stale — an effect that
    // syncs state to props would show the previous season's charts for a frame
    // every time the list arrives.
    const [pickedSeasonId, setPickedSeasonId] = useState(null);
    const selectedSeasonId =
        seasons.some((s) => s.seasonId === pickedSeasonId) ? pickedSeasonId
        : seasons.some((s) => s.seasonId === activeSeasonId) ? activeSeasonId
        : seasons[0]?.seasonId ?? null;

    const selectedSeason = seasons.find((s) => s.seasonId === selectedSeasonId) ?? null;

    const { data: awards, isPending: awardsPending } = useAwards(selectedSeasonId);
    const { data: results, isPending: resultsPending } = useAwardResults(selectedSeasonId);

    if (seasonsPending) return <RouteLoading />;

    if (!selectedSeasonId) {
        return (
            <EmptyState
                icon={PieChartIcon}
                title="No results to show yet"
                description="Results appear here once a season's ballot has been voted on and released."
            />
        );
    }

    const votedAwards = (awards ?? []).filter((a) => a.category === 'voted');
    const tallies = results ?? {};

    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        return (
            <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    return (
        <div className="space-y-6">
            {/* One viewable season is the common case — today, only 2025 has a
                ballot — and a dropdown with a single option is a control that
                cannot do anything. The summary line still names the season, so
                the reader always knows which year they are looking at. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {selectedSeason
                        ? `${selectedSeason.year} · ${selectedSeason.voterCount} ${selectedSeason.voterCount === 1 ? 'voter' : 'voters'}, ${selectedSeason.voteCount} votes cast`
                        : null}
                </p>

                {seasons.length > 1 && (
                    <Select value={selectedSeasonId} onValueChange={setPickedSeasonId}>
                        <SelectTrigger className="w-[180px]" aria-label="Season">
                            <SelectValue placeholder="Select a season..." />
                        </SelectTrigger>
                        <SelectContent>
                            {seasons.map((season) => (
                                <SelectItem key={season.seasonId} value={season.seasonId}>
                                    {season.year}
                                    {season.isActive ? ' (current)' : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {awardsPending || resultsPending ? (
                <RouteLoading />
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    {votedAwards.map((award) => {
                        const awardResults = tallies[award.id] || {};
                        const data = Object.entries(awardResults).map(([name, count]) => ({
                            name,
                            value: count
                        })).sort((a, b) => b.value - a.value);

                        const totalVotes = data.reduce((sum, item) => sum + item.value, 0);

                        return (
                            <Card key={award.id} className="flex flex-col">
                                <CardHeader>
                                    <CardTitle className="text-lg">{award.title}</CardTitle>
                                    <CardDescription>{totalVotes} votes cast</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 min-h-[300px]">
                                    {data.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={data}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={renderCustomizedLabel}
                                                    outerRadius={100}
                                                    fill="#8884d8"
                                                    dataKey="value"
                                                >
                                                    {data.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            No votes yet
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AwardsResults;
