import React, { useState } from 'react';
import { Trophy, Calendar, BarChart3, Users, Settings, Target, Plus, ArrowLeft, Film, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFantasyData } from './hooks/useFantasyData.js';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';

// Import global styles
import './globals.css';

// Components
import PowerRankingsTable from './components/PowerRankingsTable.jsx';
import WeekScoreInput from './components/WeekScoreInput.jsx';
import SeasonManager from './components/SeasonManager.jsx';
import StatisticsPanel from './components/StatisticsPanel.jsx';
import WeekNavigator from './components/WeekNavigator.jsx';
import ScheduleManager from './components/ScheduleManager.jsx';
import TeamManager from './components/TeamManager.jsx';

const FantasyFootballApp = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  // Redirect to login if not authenticated
  if (!user) {
    navigate('/');
    return null;
  }
  
  const {
    seasons,
    activeSeason,
    currentWeek,
    loading,
    error,
    powerRankings,
    createSeason,
    setActiveSeasonById,
    deleteSeason,
    addTeam,
    updateTeam,
    removeTeam,
    addWeekScores,
    generateSchedule,
    getGamesForWeek,
    getPowerRankingsForWeek,
    exportSeason,
    importSeason,
    setCurrentWeek,
    addGame,
    updateGameScore
  } = useFantasyData();

  const [activeTab, setActiveTab] = useState('rankings');
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  // Get completed weeks for navigation
  const completedWeeks = activeSeason?.weeks
    ?.filter(week => week.isCompleted)
    ?.map(week => week.weekNumber) || [];

  // Navigation tabs
  const tabs = [
    { id: 'rankings', label: 'Power Rankings', icon: Trophy, requiresSeason: true },
    { id: 'scores', label: 'Enter Scores', icon: Target, requiresSeason: true },
    { id: 'statistics', label: 'Statistics', icon: BarChart3, requiresSeason: true },
    { id: 'schedule', label: 'Schedule', icon: Calendar, requiresSeason: true },
    { id: 'teams', label: 'Teams', icon: Users, requiresSeason: true },
    { id: 'seasons', label: 'Seasons', icon: Settings, requiresSeason: false }
  ];

  const handleWeekScoresSave = async (week, scores) => {
    try {
      await addWeekScores(week, scores);
      // Optionally advance to next week if this week is now complete
      const nextWeek = Math.min(week + 1, activeSeason.totalWeeks);
      if (nextWeek !== currentWeek) {
        setCurrentWeek(nextWeek);
      }
    } catch (error) {
      console.error('Error saving week scores:', error);
      throw error;
    }
  };

  const handleGameUpdate = async (week, team1Id, team2Id, team1Score, team2Score) => {
    try {
      await addGame(week, team1Id, team2Id, team1Score, team2Score);
    } catch (error) {
      console.error('Error updating game:', error);
      throw error;
    }
  };

  const handleGameDelete = async (gameId) => {
    console.log('Delete game:', gameId);
    alert('Game deletion not yet implemented');
  };

  // Show season selection if no active season
  if (!activeSeason && activeTab !== 'seasons') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
        
        <div className="relative min-h-screen flex flex-col">
          {/* Header */}
          <header className="p-6">
            <Button
              onClick={() => navigate('/overview')}
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white hover:bg-white/10 backdrop-blur-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <Film className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Movie Tracker</span>
            </Button>
          </header>

          {/* Main Content */}
          <div className="flex-1 flex items-center justify-center p-6">
            <Card className="w-full max-w-2xl glass-effect border-white/20 text-white">
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                  <Trophy className="h-10 w-10 text-white" />
                </div>
                <CardTitle className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Fantasy Football Power Rankings
                </CardTitle>
                <CardDescription className="text-white/70 text-lg">
                  Advanced analytics for competitive fantasy football leagues
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <Button
                    onClick={() => setActiveTab('seasons')}
                    size="lg"
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25"
                  >
                    <Plus className="h-5 w-5" />
                    Get Started
                  </Button>
                </div>
                
                {seasons.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-center text-white/90">
                      Or continue with an existing season:
                    </h3>
                    <div className="grid gap-3">
                      {seasons.slice(0, 3).map(season => (
                        <Card
                          key={season.id}
                          className="glass-effect border-white/20 hover:border-white/30 transition-all cursor-pointer"
                          onClick={() => setActiveSeasonById(season.id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold text-white">
                                  {season.name || `${season.year} Season`}
                                </h4>
                                <p className="text-white/60 text-sm">
                                  {season.teams.length} teams • {season.year}
                                </p>
                              </div>
                              <Badge variant="secondary" className="bg-white/10 text-white border-white/20">
                                Active
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => navigate('/overview')}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <Film className="h-4 w-4" />
                <span className="hidden sm:inline">Movie Tracker</span>
              </Button>
              
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    Fantasy Football
                  </h1>
                  {activeSeason && (
                    <p className="text-sm text-muted-foreground">
                      {activeSeason.name || `${activeSeason.year} Season`} • Week {currentWeek}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {activeSeason && activeTab === 'rankings' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="advanced-stats"
                    checked={showAdvancedStats}
                    onChange={(e) => setShowAdvancedStats(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="advanced-stats" className="text-sm font-medium">
                    Advanced Stats
                  </label>
                </div>
              )}
              
              <div className="flex items-center space-x-3 text-sm">
                <span className="text-muted-foreground">{user?.email}</span>
                <Button
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  variant="ghost"
                  size="sm"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeSeason && activeTab !== 'seasons' && (
          <div className="mb-8">
            <WeekNavigator
              currentWeek={currentWeek}
              totalWeeks={activeSeason.totalWeeks}
              regularSeasonWeeks={activeSeason.regularSeasonWeeks}
              onWeekChange={setCurrentWeek}
              completedWeeks={completedWeeks}
              season={activeSeason}
            />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="p-4">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
            {tabs.map(tab => {
              const isDisabled = tab.requiresSeason && !activeSeason;
              const Icon = tab.icon;
              
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  disabled={isDisabled}
                  className="flex items-center space-x-2"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="rankings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Week {currentWeek} Power Rankings</span>
                  <Badge variant="outline">
                    {new Date().toLocaleDateString()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PowerRankingsTable
                  rankings={powerRankings}
                  currentWeek={currentWeek}
                  showAdvanced={showAdvancedStats}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scores">
            <WeekScoreInput
              week={currentWeek}
              teams={activeSeason?.teams || []}
              existingGames={getGamesForWeek(currentWeek)}
              onSaveWeek={handleWeekScoresSave}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="statistics">
            <Card>
              <CardHeader>
                <CardTitle>League Analytics</CardTitle>
                <CardDescription>
                  Comprehensive statistics and insights for your league
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatisticsPanel
                  rankings={powerRankings}
                  currentWeek={currentWeek}
                  season={activeSeason}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule">
            <ScheduleManager
              season={activeSeason}
              schedule={activeSeason?.schedule || []}
              onGenerateSchedule={generateSchedule}
              onUpdateGame={handleGameUpdate}
              onDeleteGame={handleGameDelete}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="teams">
            <TeamManager
              teams={activeSeason?.teams || []}
              onAddTeam={addTeam}
              onUpdateTeam={updateTeam}
              onRemoveTeam={removeTeam}
              loading={loading}
              powerRankings={powerRankings}
            />
          </TabsContent>

          <TabsContent value="seasons">
            <SeasonManager
              seasons={seasons}
              activeSeason={activeSeason}
              onCreateSeason={createSeason}
              onSetActiveSeason={setActiveSeasonById}
              onDeleteSeason={deleteSeason}
              onExportSeason={exportSeason}
              onImportSeason={importSeason}
              loading={loading}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span>Loading...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default FantasyFootballApp;