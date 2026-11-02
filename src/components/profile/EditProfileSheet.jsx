import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw, Trash2 } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { NflTeamLogo } from '../ui/nfl-team-logo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { TeamAvatar } from '../ui/team-identity';
import { Textarea } from '../ui/textarea';
import { PlayerPicker } from '../pickems/PlayerPicker';
import { cn } from '../../lib/utils';
import { getTeamColor } from '../../utils/teamColors';
import { useSaveFranchiseProfile } from '../../../hooks/queries/index.js';
import { describeAvatarFile, resizeAvatar } from '../../../utils/avatarImage.js';
import { NFL_TEAM_NAMES } from '../../../utils/playerImages.js';
import { ACCENT_HUES, BIO_MAX, accentColor } from '../../../utils/profile/profileTheme.js';

const NO_TEAM = 'none';

const NFL_TEAMS = Object.entries(NFL_TEAM_NAMES).sort(([, a], [, b]) => a.localeCompare(b));

/** What the avatar will be after saving. `keep` writes nothing. */
const KEEP = { mode: 'keep' };

/** A square preview of the avatar being chosen, in the shape the page will draw it. */
function AvatarPreview({ team, url }) {
  if (!url) return <TeamAvatar team={team} size="lg" className="h-16 w-16" />;
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-border"
    />
  );
}

/**
 * Everything a member can say about their franchise. The admin gets the same
 * form for any franchise, including one no account speaks for.
 *
 * Saves on the button, as one write: a half-typed bio should not appear on a
 * public page field by field. The database is the rule on who may save; this
 * form is only offered to them.
 *
 * @param {object} props
 * @param {string} props.franchiseId
 * @param {object} props.team - `{ franchiseId, owner_name }`
 * @param {string} props.name
 * @param {object|null} props.profile
 * @param {boolean} props.asAdmin - editing somebody else's
 */
export function EditProfileSheet({ open, onOpenChange, franchiseId, team, name, profile, asAdmin }) {
  const save = useSaveFranchiseProfile();

  const [bio, setBio] = useState('');
  const [nflTeam, setNflTeam] = useState(NO_TEAM);
  const [player, setPlayer] = useState({ playerId: null, playerName: '' });
  const [accentHue, setAccentHue] = useState(null);
  const [avatar, setAvatar] = useState(KEEP);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  // Opening starts from what is stored, so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!open) return;
    setBio(profile?.bio ?? '');
    setNflTeam(profile?.favoriteNflTeam ?? NO_TEAM);
    setPlayer({ playerId: profile?.favoritePlayerId ?? null, playerName: profile?.favoritePlayerName ?? '' });
    setAccentHue(profile?.accentHue ?? null);
    setAvatar(KEEP);
    setError(null);
  }, [open, profile]);

  useEffect(() => {
    if (avatar.mode !== 'upload') return undefined;
    return () => URL.revokeObjectURL(avatar.previewUrl);
  }, [avatar]);

  const previewUrl = useMemo(() => {
    if (avatar.mode === 'upload') return avatar.previewUrl;
    if (avatar.mode === 'espn') return profile?.espnLogoUrl ?? null;
    if (avatar.mode === 'remove') return null;
    return profile?.avatarUrl ?? null;
  }, [avatar, profile]);

  const initialPlayer = useMemo(
    () =>
      profile?.favoritePlayerName
        ? { id: profile.favoritePlayerId, name: profile.favoritePlayerName }
        : null,
    [profile]
  );

  const chooseFile = async (event) => {
    const [file] = event.target.files ?? [];
    event.target.value = '';
    if (!file) return;

    const problem = describeAvatarFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    try {
      const blob = await resizeAvatar(file);
      setError(null);
      setAvatar({ mode: 'upload', blob, previewUrl: URL.createObjectURL(blob) });
    } catch {
      setError('That image could not be read. Try a JPEG or PNG.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    const patch = {
      bio: bio.trim() || null,
      favoriteNflTeam: nflTeam === NO_TEAM ? null : nflTeam,
      favoritePlayerId: player.playerId ?? null,
      favoritePlayerName: player.playerName?.trim() || null,
      accentHue
    };
    if (avatar.mode === 'espn') Object.assign(patch, { avatarSource: 'espn', avatarPath: null });
    if (avatar.mode === 'remove') Object.assign(patch, { avatarSource: null, avatarPath: null });

    try {
      await save.mutateAsync({
        franchiseId,
        patch,
        avatarBlob: avatar.mode === 'upload' ? avatar.blob : null,
        replacedAvatarPath: avatar.mode === 'keep' ? null : profile?.avatarPath ?? null
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message || 'Could not save the profile. Try again.');
    }
  };

  const hasEspnLogo = Boolean(profile?.espnLogoUrl);
  const defaultAccent = getTeamColor(team).value;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] max-w-[560px] overflow-y-auto sm:w-[560px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl tracking-tight">
            {asAdmin ? `Edit ${name}` : 'Edit your profile'}
          </SheetTitle>
          <SheetDescription>Everyone in the league can see this.</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="mt-5 space-y-6 pb-4">
          <div className="space-y-2.5">
            <Label>Avatar</Label>
            <div className="flex items-center gap-4">
              <AvatarPreview team={team} url={previewUrl} />
              <div className="flex min-w-0 flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choose an avatar image"
                  onChange={chooseFile}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Upload a photo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasEspnLogo}
                  onClick={() => setAvatar({ mode: 'espn' })}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Use ESPN team logo
                </Button>
                {previewUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAvatar({ mode: 'remove' })}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {!hasEspnLogo && (
              <p className="text-xs text-muted-foreground">
                The ESPN logo appears here once the next daily sync has picked it up.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="profile-bio">Bio</Label>
              <span className={cn('text-xs tabular', bio.length > BIO_MAX ? 'text-destructive' : 'text-muted-foreground')}>
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <Textarea
              id="profile-bio"
              rows={4}
              maxLength={BIO_MAX}
              value={bio}
              placeholder="Say something the group chat can hold against you."
              onChange={(event) => setBio(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-nfl-team">Favourite NFL team</Label>
            <Select value={nflTeam} onValueChange={setNflTeam}>
              <SelectTrigger id="profile-nfl-team" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>None</SelectItem>
                {NFL_TEAMS.map(([abbreviation, teamName]) => (
                  <SelectItem key={abbreviation} value={abbreviation}>
                    <span className="flex items-center gap-2">
                      <NflTeamLogo team={abbreviation} size={18} />
                      {teamName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Keyed so reopening shows the stored player, since the picker
              holds its own text. */}
          <PlayerPicker
            key={open ? 'open' : 'closed'}
            idPrefix="profile-player"
            label="Favourite player"
            actions={false}
            initialQuery={profile?.favoritePlayerName ?? ''}
            initialSelected={initialPlayer}
            onChange={setPlayer}
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">Accent colour</legend>
            <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label="Accent colour">
              <Swatch
                label="Team colour"
                colour={defaultAccent}
                selected={accentHue === null}
                onSelect={() => setAccentHue(null)}
              />
              {ACCENT_HUES.map((hue) => (
                <Swatch
                  key={hue}
                  label={`Hue ${hue}`}
                  colour={accentColor(hue)}
                  selected={accentHue === hue}
                  onSelect={() => setAccentHue(hue)}
                />
              ))}
            </div>
          </fieldset>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save profile
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Swatch({ label, colour, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        'h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10 pointer-coarse:w-10',
        selected && 'ring-2 ring-foreground'
      )}
      style={{ backgroundColor: colour }}
    />
  );
}

export default EditProfileSheet;
