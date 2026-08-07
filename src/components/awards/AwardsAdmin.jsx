import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Plus, Trash2, Edit2, Save, X, CheckSquare, Square, Circle, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { Switch } from '../ui/switch';
import { getDb } from '../../../services/db/index.js';

const AwardsAdmin = ({ awards, season,onUpdate, loading, teamOwnerNames = [], unlockStatus = {} }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'voted',
        icon: 'Trophy',
        displayOrder: 0,
        // For voted awards
        nominees: {
            teamIds: [],
            customNominees: []
        },
        // For non-voted awards
        winner: {
            type: 'team', // 'team' or 'custom'
            teamId: null,
            customWinner: ''
        }
    });
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [customNomineeInput, setCustomNomineeInput] = useState('');

    const handleCreate = () => {
        setFormData({
            title: '',
            description: '',
            category: 'voted',
            icon: 'Trophy',
            displayOrder: awards.length + 1,
            nominees: {
                teamIds: [],
                customNominees: []
            },
            winner: {
                type: 'team',
                teamId: null,
                customWinner: ''
            }
        });
        setCustomNomineeInput('');
        setIsCreating(true);
        setEditingId(null);
    };

    const handleEdit = (award) => {
        // Parse existing data based on category
        if (award.category === 'non-voted') {
            // Non-voted: load winner info
            const winnerData = {
                type: award.winnerInfo ? 'custom' : 'team',
                teamId: award.winnerId || null,
                customWinner: award.winnerInfo || ''
            };

            setFormData({
                title: award.title,
                description: award.description || '',
                category: award.category,
                icon: award.icon || 'Trophy',
                displayOrder: award.displayOrder || 0,
                nominees: { teamIds: [], customNominees: [] },
                winner: winnerData
            });
        } else {
            // Voted: load nominees
            const existingNominees = award.votingOptions || { teamIds: [], customNominees: [] };

            setFormData({
                title: award.title,
                description: award.description || '',
                category: award.category,
                icon: award.icon || 'Trophy',
                displayOrder: award.displayOrder || 0,
                nominees: {
                    teamIds: existingNominees.teamIds || [],
                    customNominees: existingNominees.customNominees || []
                },
                winner: { type: 'team', teamId: null, customWinner: '' }
            });
        }

        setCustomNomineeInput('');
        setEditingId(award.id);
        setIsCreating(false);
    };

    const handleCancel = () => {
        setIsCreating(false);
        setEditingId(null);
        setCustomNomineeInput('');
        setError(null);
    };

    const handleSave = async () => {
        if (!formData.title) {
            setError('Title is required');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            let saveData = {
                title: formData.title,
                description: formData.description,
                category: formData.category,
                icon: formData.icon,
                displayOrder: formData.displayOrder
            };

            if (formData.category === 'voted') {
                // Save nominees for voted awards
                saveData.votingOptions = formData.nominees;
                saveData.winnerId = null;
                saveData.winnerInfo = null;
            } else {
                // Save winner for non-voted awards
                saveData.votingOptions = { teamIds: [], customNominees: [] };
                if (formData.winner.type === 'team') {
                    saveData.winnerId = formData.winner.teamId;
                    saveData.winnerInfo = null;
                } else {
                    saveData.winnerId = null;
                    saveData.winnerInfo = formData.winner.customWinner;
                }
            }

            console.log('Saving award data:', saveData);
            console.log('Winner data:', { type: formData.winner.type, teamId: formData.winner.teamId, customWinner: formData.winner.customWinner });

            if (isCreating) {
                await getDb().awards.createAward(season.id, saveData);
            } else if (editingId) {
                await getDb().awards.updateAward(editingId, saveData);
            }
            await onUpdate();
            handleCancel();
        } catch (err) {
            setError(err.message || 'Failed to save award');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this award?')) return;

        setSaving(true);
        try {
            await getDb().awards.deleteAward(id);
            await onUpdate();
        } catch (err) {
            setError(err.message || 'Failed to delete award');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleVotingAccess = async (isOpen) => {
        setSaving(true);
        setError(null);
        try {
            await getDb().awards.toggleVotingAccess(season.id, isOpen);
            await onUpdate();
        } catch (err) {
            console.error('Error toggling voting access:', err);
            setError(err.message || 'Failed to update voting access');
        } finally {
            setSaving(false);
        }
    };

    const handleCategoryChange = (newCategory) => {
        setFormData({
            ...formData,
            category: newCategory,
            // Reset both nominees and winner when switching categories
            nominees: { teamIds: [], customNominees: [] },
            winner: { type: 'team', teamId: null, customWinner: '' }
        });
        setCustomNomineeInput('');
    };

    // Nominee functions (for voted awards)
    const toggleTeamNominee = (ownerName) => {
        const teamIds = formData.nominees.teamIds || [];
        const ownerString = typeof ownerName === 'string' ? ownerName : ownerName.ownerName;
        const newTeamIds = teamIds.includes(ownerString)
            ? teamIds.filter(id => id !== ownerString)
            : [...teamIds, ownerString];

        setFormData({
            ...formData,
            nominees: {
                ...formData.nominees,
                teamIds: newTeamIds
            }
        });
    };

    const handleSelectAll = () => {
        setFormData({
            ...formData,
            nominees: {
                ...formData.nominees,
                teamIds: teamOwnerNames.map(t => typeof t === 'string' ? t : t.ownerName)
            }
        });
    };

    const handleDeselectAll = () => {
        setFormData({
            ...formData,
            nominees: {
                ...formData.nominees,
                teamIds: []
            }
        });
    };

    const handleAddCustomNominee = () => {
        if (!customNomineeInput.trim()) return;

        const customNominees = formData.nominees.customNominees || [];
        setFormData({
            ...formData,
            nominees: {
                ...formData.nominees,
                customNominees: [...customNominees, customNomineeInput.trim()]
            }
        });
        setCustomNomineeInput('');
    };

    const handleRemoveCustomNominee = (index) => {
        const customNominees = formData.nominees.customNominees || [];
        setFormData({
            ...formData,
            nominees: {
                ...formData.nominees,
                customNominees: customNominees.filter((_, i) => i !== index)
            }
        });
    };

    // Winner functions (for non-voted awards)
    const handleSelectWinner = (ownerName) => {
        const ownerString = typeof ownerName === 'string' ? ownerName : ownerName.ownerName;
        setFormData({
            ...formData,
            winner: {
                type: 'team',
                teamId: ownerString,
                customWinner: ''
            }
        });
    };

    const handleCustomWinnerChange = (value) => {
        setFormData({
            ...formData,
            winner: {
                type: 'custom',
                teamId: null,
                customWinner: value
            }
        });
    };

    const renderEditForm = () => (
        <div className="bg-muted/50 p-4 rounded-lg space-y-4 border-2 border-primary/20">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Award Title"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                        value={formData.category}
                        onValueChange={handleCategoryChange}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="voted">Voted</SelectItem>
                            <SelectItem value="non-voted">Non-Voted</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Award Description"
                    rows={2}
                />
            </div>

            {/* Conditional: Nominees for Voted, Winner for Non-Voted */}
            {formData.category === 'voted' ? (
                // VOTED AWARDS: Nominees Section
                <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Nominees</Label>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleSelectAll}
                            >
                                Select All
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleDeselectAll}
                            >
                                Deselect All
                            </Button>
                        </div>
                    </div>

                    {/* Team/Owner Selection */}
                    <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Team/Owner Nominees</Label>
                        <div className="grid grid-cols-2 gap-2 p-2 border rounded bg-background">
                            {teamOwnerNames.map((ownerData) => {
                                const ownerName = typeof ownerData === 'string' ? ownerData : ownerData.ownerName;
                                const isSelected = (formData.nominees.teamIds || []).includes(ownerName);
                                return (
                                    <div
                                        key={ownerName}
                                        className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                                        onClick={() => toggleTeamNominee(ownerData)}
                                    >
                                        {isSelected ? (
                                            <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
                                        ) : (
                                            <Square className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        )}
                                        <span className="text-sm">{ownerName}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom Nominee Entry */}
                    <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Custom Nominees (moments, players, actions, etc.)</Label>
                        <div className="flex gap-2">
                            <Input
                                value={customNomineeInput}
                                onChange={(e) => setCustomNomineeInput(e.target.value)}
                                placeholder="e.g., Best Trash Talk Moment, Worst Trade, etc."
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddCustomNominee();
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                onClick={handleAddCustomNominee}
                                disabled={!customNomineeInput.trim()}
                            >
                                Add
                            </Button>
                        </div>

                        {/* Display Custom Nominees */}
                        {(formData.nominees.customNominees || []).length > 0 && (
                            <div className="space-y-1 p-2 border rounded bg-background">
                                {formData.nominees.customNominees.map((nominee, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                                    >
                                        <span className="text-sm">{nominee}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveCustomNominee(index)}
                                            className="h-6 w-6 p-0"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // NON-VOTED AWARDS: Winner Selection
                <div className="space-y-3 pt-2 border-t">
                    <Label className="text-base font-semibold">Winner Selection</Label>

                    {/* Team/Owner Winner Selection */}
                    <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Select Team/Owner Winner</Label>
                        <div className="grid grid-cols-2 gap-2 p-2 border rounded bg-background">
                            {teamOwnerNames.map((ownerData) => {
                                const ownerName = typeof ownerData === 'string' ? ownerData : ownerData.ownerName;
                                const isSelected = formData.winner.type === 'team' && formData.winner.teamId === ownerName;
                                return (
                                    <div
                                        key={ownerName}
                                        className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                                        onClick={() => handleSelectWinner(ownerData)}
                                    >
                                        {isSelected ? (
                                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                                        ) : (
                                            <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        )}
                                        <span className="text-sm">{ownerName}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom Winner Entry */}
                    <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">OR Enter Custom Winner</Label>
                        <Input
                            value={formData.winner.type === 'custom' ? formData.winner.customWinner : ''}
                            onChange={(e) => handleCustomWinnerChange(e.target.value)}
                            placeholder="e.g., Best Comeback Moment, Epic Trade Fail, etc."
                        />
                        {formData.winner.type === 'custom' && formData.winner.customWinner && (
                            <p className="text-xs text-muted-foreground">
                                Custom winner selected: <span className="font-medium">{formData.winner.customWinner}</span>
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Award'}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Manage Awards</CardTitle>
                            <CardDescription>Create, edit, and manage awards and nominees for the season</CardDescription>
                        </div>
                        <Button onClick={handleCreate} disabled={isCreating || !!editingId}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Award
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Access Control Toggle */}
                    <Card className="mb-6 border-2 border-primary/20 bg-primary/5">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2">
                                        {unlockStatus.votingOpenToAll ? (
                                            <Unlock className="h-5 w-5 text-green-600" />
                                        ) : (
                                            <Lock className="h-5 w-5 text-orange-600" />
                                        )}
                                        <Label className="text-base font-semibold">
                                            Awards Section Access
                                        </Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {unlockStatus.votingOpenToAll
                                            ? 'All authenticated users can access the awards section and vote'
                                            : 'Only admins can access the awards section'
                                        }
                                    </p>
                                </div>
                                <Switch
                                    checked={Boolean(unlockStatus?.votingOpenToAll)}
                                    onCheckedChange={handleToggleVotingAccess}
                                    disabled={saving}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Create Form (at top) */}
                    {isCreating && (
                        <div className="mb-6">
                            {renderEditForm()}
                        </div>
                    )}

                    {/* Awards List with Inline Editing */}
                    <div className="space-y-4">
                        {awards.map((award) => (
                            <div key={award.id} className="space-y-2">
                                {/* Award Display Row */}
                                <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                                    <div className="flex-1">
                                        <h4 className="font-medium">{award.title}</h4>
                                        <p className="text-sm text-muted-foreground">{award.description}</p>
                                        <div className="flex gap-2 mt-2 flex-wrap">
                                            <span className="text-xs bg-secondary px-2 py-0.5 rounded-full capitalize">
                                                {award.category}
                                            </span>
                                            {award.category === 'voted' && award.votingOptions && (
                                                <>
                                                    {(award.votingOptions.teamIds?.length || 0) > 0 && (
                                                        <span className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                                            {award.votingOptions.teamIds.length} Team Nominees
                                                        </span>
                                                    )}
                                                    {(award.votingOptions.customNominees?.length || 0) > 0 && (
                                                        <span className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                                            {award.votingOptions.customNominees.length} Custom Nominees
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                            {award.category === 'non-voted' && (award.winnerId || award.winnerInfo) && (
                                                <span className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                                                    Winner: {award.winnerInfo || award.winnerId}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(award)}
                                            disabled={editingId === award.id || isCreating}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => handleDelete(award.id)}
                                            disabled={saving}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Inline Edit Form */}
                                {editingId === award.id && (
                                    <div className="ml-4">
                                        {renderEditForm()}
                                    </div>
                                )}
                            </div>
                        ))}

                        {awards.length === 0 && !loading && !isCreating && (
                            <div className="text-center py-8 text-muted-foreground">
                                No awards created yet. Click "Add Award" to get started.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AwardsAdmin;
