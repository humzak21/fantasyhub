import React, { useState, useEffect } from 'react';
import { History, Trophy, Users, Target, Award, Medal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  useHistoryTimeline,
  useHistoryFranchises,
  useChampionships
} from '../../../hooks/queries/index.js';

// Import overview components
import HistoryTimeline from './overview/HistoryTimeline';
import QuickStatsPanel from './overview/QuickStatsPanel';

// Import franchise components
import AllTimeLeaderboards from './franchises/AllTimeLeaderboards';
import FranchiseProfile from './franchises/FranchiseProfile';

// Import season components
import SeasonDetail from './seasons/SeasonDetail';

// Import head-to-head components
import HeadToHeadMatrix from './headtohead/HeadToHeadMatrix';
import MatchupDetail from './headtohead/MatchupDetail';

// Import records and awards components
import RecordBook from './records/RecordBook';
import AwardsGallery from './awards/AwardsGallery';
import { useViewer } from '../../contexts/ViewerContext.jsx';

const LeagueHistoryManager = ({
  activeSeason = null
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  // Three independent queries rather than one mega-hook. TanStack deduplicates
  // them across the six components below, which each used to run their own
  // copy of the old hook's four-call `initialize()`.
  const timelineQuery = useHistoryTimeline();
  const franchisesQuery = useHistoryFranchises();
  const championshipsQuery = useChampionships();

  const seasons = timelineQuery.data ?? [];
  // One list, two props: a franchise row carries its own career stats.
  const franchises = franchisesQuery.data ?? [];
  const careerStats = franchises;
  const championships = championshipsQuery.data ?? [];

  const initializing = timelineQuery.isLoading || franchisesQuery.isLoading;
  const loading = timelineQuery.isFetching || franchisesQuery.isFetching || championshipsQuery.isFetching;
  const error =
    timelineQuery.error?.message ??
    franchisesQuery.error?.message ??
    championshipsQuery.error?.message ??
    null;

  const refresh = () => {
    timelineQuery.refetch();
    franchisesQuery.refetch();
    championshipsQuery.refetch();
  };

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState('overview');

  // Selection state
  const [selectedFranchiseId, setSelectedFranchiseId] = useState(null);
  const [selectedSeasonYear, setSelectedSeasonYear] = useState(null);

  // View-specific state
  const [selectedH2HFranchise1, setSelectedH2HFranchise1] = useState(null);
  const [selectedH2HFranchise2, setSelectedH2HFranchise2] = useState(null);

  const selectedFranchise = franchises.find(f => f.id === selectedFranchiseId) ?? null;
  const selectedSeason = seasons.find(s => s.year === selectedSeasonYear) ?? null;

  // Auto-scroll to top on sub-tab change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeSubTab]);

  // Handle initialization errors
  if (!initializing && error && !franchises.length) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            League History
          </CardTitle>
          <CardDescription>
            Explore franchise records, championships, and season-by-season statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <div className="mt-4">
                <Button onClick={refresh} variant="outline" size="sm">
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (initializing) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            League History
          </CardTitle>
          <CardDescription>
            Explore franchise records, championships, and season-by-season statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading league history...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state - no data
  if (!franchises.length || !seasons.length) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            League History
          </CardTitle>
          <CardDescription>
            Explore franchise records, championships, and season-by-season statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              <div className="space-y-4">
                <p>No league history yet.</p>
                <p className="text-sm text-muted-foreground">
                  A season appears here once it is finalized in Season Management —
                  that is what works out the final standings and awards.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Sub-tab configuration
  const subTabs = [
    {
      id: 'overview',
      label: 'Overview',
      icon: History,
      description: 'League timeline and quick stats'
    },
    {
      id: 'franchises',
      label: 'Franchises',
      icon: Users,
      description: 'All-time leaderboards and franchise profiles'
    },
    {
      id: 'headtohead',
      label: 'Head-to-Head',
      icon: Target,
      description: 'Matchup records and history'
    },
    {
      id: 'records',
      label: 'Records',
      icon: Medal,
      description: 'League record book'
    },
    {
      id: 'awards',
      label: 'Awards',
      icon: Award,
      description: 'Championships and honors'
    }
  ];

  return (
    <div className="space-y-6 mt-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            League History
            <Badge variant="secondary" className="ml-auto">
              {franchises.length} Franchises
            </Badge>
            <Badge variant="outline">
              {seasons.length} Seasons
            </Badge>
          </CardTitle>
          <CardDescription>
            Explore franchise records, championships, and season-by-season statistics.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error Alert (if any) */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button onClick={refresh} variant="ghost" size="sm">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Sub-tabs Navigation */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {!selectedSeasonYear ? (
            <>
              <QuickStatsPanel
                franchises={franchises}
                seasons={seasons}
                careerStats={careerStats}
                championships={championships}
                user={user}
                isAdmin={isAdmin}
                teamOwnerNames={teamOwnerNames}
                onViewFranchise={(franchiseId) => {
                  setSelectedFranchiseId(franchiseId);
                  setActiveSubTab('franchises');
                }}
                onViewSeason={(year) => {
                  setSelectedSeasonYear(year);
                }}
              />
              <HistoryTimeline
                seasons={seasons}
                user={user}
                isAdmin={isAdmin}
                teamOwnerNames={teamOwnerNames}
                onSeasonClick={(year) => {
                  setSelectedSeasonYear(year);
                }}
              />
            </>
          ) : (
            <SeasonDetail
              season={selectedSeason}
              seasonYear={selectedSeasonYear}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              onBack={() => setSelectedSeasonYear(null)}
            />
          )}
        </TabsContent>

        {/* Franchises Tab */}
        <TabsContent value="franchises" className="space-y-6">
          {!selectedFranchiseId ? (
            <AllTimeLeaderboards
              franchises={franchises}
              careerStats={careerStats}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              onViewProfile={(franchiseId) => setSelectedFranchiseId(franchiseId)}
            />
          ) : (
            <FranchiseProfile
              franchise={selectedFranchise}
              franchiseId={selectedFranchiseId}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              onBack={() => setSelectedFranchiseId(null)}
            />
          )}
        </TabsContent>


        {/* Head-to-Head Tab */}
        <TabsContent value="headtohead" className="space-y-6">
          {!selectedH2HFranchise1 || !selectedH2HFranchise2 ? (
            <HeadToHeadMatrix
              franchises={franchises}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              onMatchupClick={(franchise1Id, franchise2Id) => {
                setSelectedH2HFranchise1(franchise1Id);
                setSelectedH2HFranchise2(franchise2Id);
              }}
            />
          ) : (
            <MatchupDetail
              franchise1Id={selectedH2HFranchise1}
              franchise2Id={selectedH2HFranchise2}
              franchises={franchises}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              onBack={() => {
                setSelectedH2HFranchise1(null);
                setSelectedH2HFranchise2(null);
              }}
            />
          )}
        </TabsContent>

        {/* Records Tab */}
        <TabsContent value="records" className="space-y-6">
          <RecordBook
            franchises={franchises}
            user={user}
            isAdmin={isAdmin}
            teamOwnerNames={teamOwnerNames}
            onViewFranchise={(franchiseId) => {
              setSelectedFranchiseId(franchiseId);
              setActiveSubTab('franchises');
            }}
          />
        </TabsContent>

        {/* Awards Tab */}
        <TabsContent value="awards" className="space-y-6">
          <AwardsGallery
            franchises={franchises}
            seasons={seasons}
            championships={championships}
            user={user}
            isAdmin={isAdmin}
            teamOwnerNames={teamOwnerNames}
            onViewFranchise={(franchiseId) => {
              setSelectedFranchiseId(franchiseId);
              setActiveSubTab('franchises');
            }}
            onViewSeason={(year) => {
              setSelectedSeasonYear(year);
              setActiveSubTab('overview');
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Loading overlay for data fetches */}
      {loading && !initializing && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span className="text-sm">Loading...</span>
        </div>
      )}
    </div>
  );
};

export default LeagueHistoryManager;
