import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { getDb } from '../../../services/db/index.js';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

const AwardsResults = ({ awards, season,loading }) => {
    const [results, setResults] = useState({});
    const [loadingResults, setLoadingResults] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            if (!season) return;
            setLoadingResults(true);
            try {
                const data = await getDb().awards.getAwardResults(season.id);
                setResults(data || {});
            } catch (err) {
                console.error('Failed to load results:', err);
            } finally {
                setLoadingResults(false);
            }
        };

        fetchResults();
    }, [season]);

    if (loading || loadingResults) return <div>Loading results...</div>;

    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
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
            <div className="grid gap-6 md:grid-cols-2">
                {awards.map((award) => {
                    const awardResults = results[award.id] || {};
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
        </div>
    );
};

export default AwardsResults;
