import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Trophy, Crown, Star, Zap, Target, TrendingUp } from 'lucide-react';
import { Badge } from '../ui/badge';

const AwardsGallery = ({ awards, season, loading }) => {
    if (loading) return <div>Loading gallery...</div>;

    // Helper to get icon component
    const getIcon = (iconName) => {
        const icons = { Trophy, Crown, Star, Zap, Target, TrendingUp };
        return icons[iconName] || Trophy;
    };

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">The Hall of Fame</h2>
                <p className="text-muted-foreground">Celebrating the Season {season?.year} Winners</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {awards.map((award) => {
                    const Icon = getIcon(award.icon);
                    return (
                        <Card key={award.id} className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/20">
                            <CardHeader className="text-center pb-2">
                                <div className="mx-auto p-4 rounded-full bg-muted mb-4 w-fit">
                                    <Icon className="h-8 w-8 text-primary" />
                                </div>
                                <CardTitle className="text-xl">{award.title}</CardTitle>
                                <CardDescription>{award.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="text-center">
                                {award.winner_id ? (
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium text-muted-foreground">Winner</div>
                                        <Badge variant="secondary" className="text-lg px-4 py-1">
                                            {award.winner_id}
                                        </Badge>
                                    </div>
                                ) : (
                                    <div className="py-4 text-sm text-muted-foreground italic">
                                        Winner to be announced
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

export default AwardsGallery;
