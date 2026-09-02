import React, { useState, useEffect } from 'react';
import { History, Users, Target, Award, Medal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Card } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';
import PageHeader from '../layout/PageHeader';
import RouteLoading from '../layout/RouteLoading';
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

  // The one header, in every state. The counts only join it once there is
  // something to count — a "0 Franchises" badge over a spinner would be a
  // claim about the league rather than about the fetch.
  const header = (
    <PageHeader
      icon={History}
      title="League History"
      description="Franchise records, championships, and season-by-season statistics."
      badge={
        franchises.length > 0 && seasons.length > 0 ? (
          <>
            <Badge variant="secondary">{franchises.length} Franchises</Badge>
            <Badge variant="outline">{seasons.length} Seasons</Badge>
          </>
        ) : null
      }
    />
  );

  // Handle initialization errors
  if (!initializing && error && !franchises.length) {
    return (
      <>
        {header}
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
      </>
    );
  }

  // Loading state
  if (initializing) {
    return (
      <>
        {header}
        <RouteLoading />
      </>
    );
  }

  // Empty state - no data
  if (!franchises.length || !seasons.length) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={History}
            title="No league history yet"
            description="A season appears here once it is finalized in Season Management — that is what works out the final standings and awards."
          />
        </Card>
      </>
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
    <div className="space-y-6">
      {header}

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
        {/* This is where the `icon` prop came from — `hidden sm:inline` on the
            label, done by hand here first. It is a TabsTrigger feature now, so
            the label also survives as the accessible name. */}
        <TabsList className="w-full">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} icon={<Icon className="h-4 w-4" />}>
                {tab.label}
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
