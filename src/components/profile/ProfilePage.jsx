import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserRound } from 'lucide-react';

import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useActualWeek,
  useAutosubAccess,
  useFranchiseProfile,
  useFranchiseProfiles,
  useHistoryFranchises,
  useLeagueData,
  useMyFranchiseId,
  useRankingsForWeek,
  useSeasonConfig,
  useStandings
} from '../../../hooks/queries/index.js';
import { currentSeasonStanding } from '../../../utils/profile/seasonStanding.js';
import { franchiseIdOf } from '../../../utils/viewerTeam.js';
import { LogOutButton } from '../auth/LogOutButton.jsx';
import {
  canViewFullData,
  getMaskedFranchiseName,
  getMaskedHistoricalTeamName
} from '../history/utils/privacyHelpers';
import FranchiseProfile from '../history/franchises/FranchiseProfile';
import { FranchiseRivalries } from './FranchiseRivalries';
import { AutosubSection } from '../autosub/AutosubSection';
import { ProfileHero } from './ProfileHero';
import { TrophyCase } from './TrophyCase';
import { profilePath } from './profileLink';

// The editor pulls in the player picker and the image code, and most visits
// never open it.
const EditProfileSheet = lazy(() =>
  import('./EditProfileSheet').then((module) => ({ default: module.EditProfileSheet }))
);

const ProfileSkeleton = () => (
  <div className="space-y-6" aria-hidden="true">
    <Skeleton className="h-52 w-full rounded-2xl" />
    <Skeleton className="h-24 w-full rounded-xl" />
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
);

/**
 * A franchise's page: what it says about itself, what it has won, and the whole
 * of its history. Every team name on the site opens one.
 *
 * Approved members only (the shell's `customAccess`, and RLS on the customized
 * half). A member who sees masked names gets the masked page: the name, the bio
 * and the avatar are what the masking exists to hide.
 *
 * `/profile` with no id is the viewer's own, which is what the Menu links to.
 */
export function ProfilePage() {
  const { franchiseId: routeId } = useParams();
  const { user, isAdmin, isTeamOwner, teamOwnerNames } = useViewer();
  const navigate = useNavigate();

  const franchisesQuery = useHistoryFranchises();
  const { data: profiles } = useFranchiseProfiles();
  const { data: myFranchiseId, isPending: myFranchisePending } = useMyFranchiseId();
  const { teamId: myTeamId } = useAutosubAccess();

  const franchiseId = routeId ?? null;
  const franchises = useMemo(() => franchisesQuery.data ?? [], [franchisesQuery.data]);
  const franchise = franchises.find((row) => row.id === franchiseId) ?? null;
  const { data: franchiseData, isLoading: dataLoading } = useFranchiseProfile(franchiseId);
  const [editing, setEditing] = useState(false);

  // The hero's figures are present tense, like Home: the actual week, on the
  // keys the Rankings tab and the standings drawer already hold. The header's
  // week control changes nothing here. `null` until the season config has a
  // start date, because `useActualWeek()` answers 1 before then.
  const { activeSeason } = useLeagueData();
  const config = useSeasonConfig();
  const derivedWeek = useActualWeek();
  const actualWeek = config?.startDate ? derivedWeek : null;
  const currentTeam = activeSeason?.teams?.find((row) => franchiseIdOf(row) === franchiseId) ?? null;
  const seasonId = currentTeam ? activeSeason.id : null;
  const rankings = useRankingsForWeek(seasonId, actualWeek, actualWeek);
  const standings = useStandings(seasonId);

  const viewer = useMemo(() => ({ user, isAdmin, teamOwnerNames }), [user, isAdmin, teamOwnerNames]);
  const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
  const canOpenHistory = Boolean(isAdmin || isTeamOwner);

  const options = useMemo(
    () =>
      franchises
        .map((row) => ({ id: row.id, name: getMaskedFranchiseName(row, user, isAdmin, teamOwnerNames) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [franchises, user, isAdmin, teamOwnerNames]
  );

  if (!routeId) {
    if (myFranchisePending) return <ProfileSkeleton />;
    if (myFranchiseId) return <Navigate to={profilePath(myFranchiseId)} replace />;
    return (
      <Card>
        <EmptyState
          icon={UserRound}
          title="No franchise linked yet"
          description="An admin links your account to your franchise in Settings. Your profile opens here after that."
          action={<LogOutButton />}
        />
      </Card>
    );
  }

  if (franchisesQuery.isLoading) return <ProfileSkeleton />;

  if (!franchise) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={UserRound}
            title="Franchise not found"
            description="That link does not point at a franchise in this league."
          />
        </CardContent>
      </Card>
    );
  }

  const seasonHistory = franchiseData?.seasonHistory ?? [];
  const latestSeason = seasonHistory.reduce(
    (latest, row) => ((row.season?.year ?? 0) > (latest?.season?.year ?? 0) ? row : latest),
    null
  );
  const profile = fullData ? profiles?.[franchiseId] ?? null : null;
  const name = getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
  const team = fullData
    ? { franchiseId, owner_name: franchise.owner_name }
    : { franchiseId, name };

  const isOwn = Boolean(myFranchiseId) && myFranchiseId === franchiseId;
  const editMode = isOwn ? 'own' : isAdmin ? 'admin' : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canOpenHistory ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/history?tab=franchises">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              All franchises
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {/* Any franchise's profile is one pick away, without the round trip. */}
        {options.length > 1 && (
          <Select value={franchiseId} onValueChange={(id) => navigate(profilePath(id))}>
            <SelectTrigger className="h-9 w-full sm:w-[240px]" aria-label="Franchise">
              <SelectValue placeholder="Franchise" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ProfileHero
        team={team}
        name={name}
        teamName={latestSeason ? getMaskedHistoricalTeamName(latestSeason, user, isAdmin, teamOwnerNames) : null}
        franchise={franchise}
        profile={profile}
        seasons={seasonHistory.length || franchise.total_seasons || 0}
        rosterTeamId={currentTeam?.id ?? null}
        season={
          currentTeam
            ? {
                year: activeSeason.year,
                standing: currentSeasonStanding({
                  teamId: currentTeam.id,
                  rankings: rankings.data,
                  standings: standings.data
                }),
                loading: rankings.isLoading || standings.isLoading
              }
            : null
        }
        showDivision={fullData}
        editing={editMode}
        showLogOut={isOwn}
        onEdit={() => setEditing(true)}
      />

      {isOwn && <AutosubSection teamId={myTeamId} framed />}

      <TrophyCase
        franchiseId={franchiseId}
        franchises={franchises}
        seasonHistory={seasonHistory}
        viewer={viewer}
        fullData={fullData}
        canOpenRecords={canOpenHistory}
      />

      <FranchiseProfile
        franchise={franchise}
        franchiseId={franchiseId}
        franchiseData={franchiseData}
        loading={dataLoading}
        user={user}
        isAdmin={isAdmin}
        teamOwnerNames={teamOwnerNames}
        rivalries={
          <FranchiseRivalries
            franchiseId={franchiseId}
            rivalries={franchiseData?.rivalries}
            franchises={franchises}
            viewer={viewer}
            linkH2H={canOpenHistory}
          />
        }
      />

      {editMode && editing && (
        <Suspense fallback={null}>
          <EditProfileSheet
            open={editing}
            onOpenChange={setEditing}
            franchiseId={franchiseId}
            team={team}
            name={name}
            profile={profile}
            asAdmin={editMode === 'admin'}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ProfilePage;
