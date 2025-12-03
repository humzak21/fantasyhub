import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { CheckCircle2, Save, AlertCircle } from 'lucide-react';

const AwardsVoting = ({
    awards,
    userVotes,
    onVote,
    dataManager,
    season,
    user,
    loading,
    teamOwnerNames = []
}) => {
    const [votes, setVotes] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Initialize votes from existing user votes
    useEffect(() => {
        if (userVotes && userVotes.length > 0) {
            const initialVotes = {};
            userVotes.forEach(vote => {
                initialVotes[vote.awardId] = vote.voteValue;
            });
            setVotes(initialVotes);
        }
    }, [userVotes]);

    const handleVoteChange = (awardId, value) => {
        setVotes(prev => ({
            ...prev,
            [awardId]: value
        }));
        setSuccess(false);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        setSuccess(false);

        try {
            const votesToSubmit = Object.entries(votes).map(([awardId, voteValue]) => ({
                awardId,
                voteValue
            }));

            await dataManager.submitAwardVotes(season.id, votesToSubmit);
            await onVote(); // Reload data
            setSuccess(true);
        } catch (err) {
            setError(err.message || 'Failed to submit votes');
        } finally {
            setSubmitting(false);
        }
    };

    // Helper to get options for an award (teams/owners)
    // votingOptions structure: { teamIds: [...], customNominees: [...] }
    const getOptions = (award) => {
        const options = [];

        // Check if votingOptions exists and has content
        if (award.votingOptions && typeof award.votingOptions === 'object') {
            const { teamIds = [], customNominees = [] } = award.votingOptions;

            // Add team/owner nominees
            teamIds.forEach(ownerId => {
                const ownerData = teamOwnerNames.find(
                    t => (typeof t === 'string' ? t : t.ownerName) === ownerId
                );

                if (ownerData) {
                    const ownerName = typeof ownerData === 'string' ? ownerData : ownerData.ownerName;
                    const teamName = typeof ownerData === 'string' ? undefined : ownerData.teamName;

                    options.push({
                        id: ownerName,
                        label: ownerName,
                        subLabel: teamName
                    });
                } else {
                    // If owner not found in teamOwnerNames, still add them
                    options.push({
                        id: ownerId,
                        label: ownerId,
                        subLabel: undefined
                    });
                }
            });

            // Add custom nominees
            customNominees.forEach((nominee, index) => {
                options.push({
                    id: `custom-${index}-${nominee}`,
                    label: nominee,
                    subLabel: undefined
                });
            });
        }

        // If no voting options configured or empty, default to all team owners
        if (options.length === 0) {
            return teamOwnerNames.map((owner, index) => ({
                id: owner.ownerName || `owner-${index}`,
                label: owner.ownerName,
                subLabel: owner.teamName
            }));
        }

        return options;
    };

    if (loading) return <div>Loading ballot...</div>;

    return (
        <div className="space-y-6">
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {success && (
                <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                        Your votes have been saved successfully!
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {awards.map((award) => (
                    <Card key={award.id}>
                        <CardHeader>
                            <CardTitle className="text-lg">{award.title}</CardTitle>
                            <CardDescription>{award.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Select
                                value={votes[award.id] || ''}
                                onValueChange={(val) => handleVoteChange(award.id, val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a winner..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {getOptions(award).map((option) => (
                                        <SelectItem key={option.id} value={option.id}>
                                            {option.subLabel ? `${option.label} (${option.subLabel})` : option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="mt-8 flex justify-center">
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Submitting...' : 'Submit Ballot'}
                </Button>
            </div>
        </div>
    );
};

export default AwardsVoting;
