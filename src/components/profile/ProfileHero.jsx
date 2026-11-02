import { Calendar, Pencil, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { NflTeamLogo } from '../ui/nfl-team-logo';
import { PlayerAvatar } from '../ui/player-avatar';
import { Skeleton } from '../ui/skeleton';
import { TeamAvatar } from '../ui/team-identity';
import { LogOutButton } from '../auth/LogOutButton.jsx';
import { teamRosterPath } from '../teams/teamLink';
import { formatYearRange } from '../history/utils/statFormatters';
import { getTeamColor } from '../../utils/teamColors';
import { EMPTY, formatOrdinal, formatPoints } from '../../utils/format';
import { NFL_TEAM_NAMES, teamOf } from '../../../utils/playerImages.js';
import { accentColor } from '../../../utils/profile/profileTheme.js';

/** The washed field behind the head of the page. The profile's one decoration. */
function ProfileBackdrop({ accent }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(115deg, color-mix(in oklab, ${accent} 26%, transparent), transparent 62%)`
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), var(--border) calc(10% - 1px), var(--border) 10%)',
          maskImage: 'linear-gradient(115deg, black, transparent 55%)',
          WebkitMaskImage: 'linear-gradient(115deg, black, transparent 55%)'
        }}
      />
    </div>
  );
}

function Favourite({ label, image, children }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background/50 py-1.5 pl-2 pr-3">
      {image}
      <div className="min-w-0">
        <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium leading-tight">{children}</p>
      </div>
    </div>
  );
}

/** One figure of the season so far. A figure not known yet is the em dash. */
function SeasonFigure({ label, value, loading }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold leading-none tracking-[-0.01em] tabular sm:text-[28px]">
        {loading ? <Skeleton className="h-7 w-14" /> : value ?? EMPTY}
      </dd>
    </div>
  );
}

/** Where the team stands right now: power rank, division place, points for. */
function SeasonFigures({ year, standing, loading, showDivision }) {
  const divisionLabel = showDivision && standing?.divisionName ? `${standing.divisionName} rank` : 'Division rank';
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{year} season</p>
      <dl className="grid max-w-md grid-cols-3 gap-3">
        <SeasonFigure label="Power rank" value={standing?.powerRank ? `#${standing.powerRank}` : null} loading={loading} />
        <SeasonFigure
          label={divisionLabel}
          value={standing?.divisionRank ? formatOrdinal(standing.divisionRank) : null}
          loading={loading}
        />
        <SeasonFigure
          label="Points for"
          value={standing?.pointsFor != null ? formatPoints(standing.pointsFor) : null}
          loading={loading}
        />
      </dl>
    </div>
  );
}

/**
 * The head of a profile: who this is, in their own words.
 *
 * Everything customizable is absent until it is set, so a franchise nobody has
 * touched reads as a clean name and record rather than a form with blanks.
 *
 * @param {object} props
 * @param {object} props.team - `{ franchiseId, owner_name }` for the chip and colour
 * @param {string} props.name - masked by the caller
 * @param {string|null} props.teamName - the current or last team name
 * @param {object} props.franchise
 * @param {object|null} props.profile - null for a viewer who sees masked names
 * @param {string|number|null} props.rosterTeamId - this season's team, for its roster link
 * @param {{ year: number, standing: object|null, loading: boolean }|null} props.season -
 *   the current season's figures; null for a franchise not playing in it
 * @param {boolean} props.showDivision - may this viewer see the division's name
 * @param {'own'|'admin'|null} props.editing - what the Edit button says, if shown
 * @param {boolean} props.showLogOut - this is the viewer's own profile
 * @param {Function} props.onEdit
 */
export function ProfileHero({
  team,
  name,
  teamName,
  franchise,
  profile,
  seasons,
  rosterTeamId,
  season = null,
  showDivision = false,
  editing,
  showLogOut = false,
  onEdit
}) {
  const accent = accentColor(profile?.accentHue) ?? getTeamColor(team).value;
  const nflTeam = profile?.favoriteNflTeam;
  const player = profile?.favoritePlayerName;

  return (
    <section className="home-reveal relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
      <ProfileBackdrop accent={accent} />

      <div className="relative flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <TeamAvatar
            team={team}
            size="xl"
            style={{ boxShadow: `0 0 0 3px color-mix(in oklab, ${accent} 70%, transparent)` }}
          />

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[34px] font-semibold leading-none tracking-[-0.01em] text-foreground sm:text-5xl">
              {name}
            </h1>
            {teamName && <p className="mt-1.5 truncate text-[15px] text-muted-foreground">{teamName}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                {formatYearRange(franchise.joined_year, franchise.left_year)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {seasons} {seasons === 1 ? 'season' : 'seasons'}
              </span>
              {!franchise.is_active && <Badge variant="outline">Inactive</Badge>}
            </div>
          </div>

          {(editing || rosterTeamId || showLogOut) && (
            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
              {editing && (
                <Button size="sm" onClick={onEdit}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {editing === 'admin' ? 'Edit as admin' : 'Edit profile'}
                </Button>
              )}
              {rosterTeamId && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={teamRosterPath(rosterTeamId)}>
                    <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Roster
                  </Link>
                </Button>
              )}
              {showLogOut && <LogOutButton />}
            </div>
          )}
        </div>

        {season && (
          <SeasonFigures
            year={season.year}
            standing={season.standing}
            loading={season.loading}
            showDivision={showDivision}
          />
        )}

        {profile?.bio && (
          <p className="max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
            {profile.bio}
          </p>
        )}

        {(nflTeam || player) && (
          <div className="flex flex-wrap gap-2">
            {nflTeam && (
              <Favourite label="Favourite team" image={<NflTeamLogo team={nflTeam} size={28} />}>
                {NFL_TEAM_NAMES[nflTeam] ?? nflTeam}
              </Favourite>
            )}
            {player && (
              <Favourite
                label="Favourite player"
                image={
                  <PlayerAvatar
                    name={player}
                    espnPlayerId={profile.favoritePlayer?.espnPlayerId}
                    position={profile.favoritePlayer?.position}
                    team={teamOf(profile.favoritePlayer ?? {})}
                    size={28}
                  />
                }
              >
                {player}
              </Favourite>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default ProfileHero;
