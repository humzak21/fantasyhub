/**
 * What a franchise says about itself, and which accounts may say it.
 *
 * The profile row is the franchise's, not an account's: `franchise_accounts`
 * is what ties an account to one, and only an admin writes it. RLS and
 * `can_edit_franchise_profile()` are the rule; nothing here decides who may
 * do what.
 */

import { fromDbShape, toDbShape } from './caseMap.js';
import { throwDbError, unwrap } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:franchiseProfiles');

/** The storage bucket. A file's path is `<franchise id>/<random>.<ext>`. */
export const AVATAR_BUCKET = 'profile-avatars';

/** The file extension a resized avatar is stored under. */
const AVATAR_EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * The newest logo ESPN gave each franchise. The rosters step writes only the
 * active season's teams, so an older season's logo stands in for a franchise
 * that has left the league.
 */
function newestLogos(rows = []) {
  const best = new Map();
  for (const row of rows) {
    const year = row.season?.year ?? 0;
    const current = best.get(row.franchise_id);
    if (!current || year > current.year) {
      best.set(row.franchise_id, { url: row.espn_logo_url, year });
    }
  }
  return new Map([...best].map(([franchiseId, { url }]) => [franchiseId, url]));
}

/**
 * Every franchise's profile, keyed by franchise id.
 *
 * One read for the whole league because every team chip on the site draws from
 * it, and it is at most fifteen rows. A franchise that has customized nothing
 * still gets an entry when ESPN has a logo for it, which is what offers the
 * import. `avatarUrl` is what to draw: an upload's public URL, the current ESPN
 * logo, or null for the team's initials.
 *
 * RLS returns no rows to anyone but an approved member.
 */
export async function getFranchiseProfiles(ctx) {
  try {
    const [rows, logoRows, franchises] = await Promise.all([
      unwrap(
        await ctx.client
          .from('franchise_profiles')
          .select('*, player:favorite_player_id(espn_player_id, team_abbreviation, position)'),
        'Get franchise profiles'
      ),
      unwrap(
        await ctx.client
          .from('teams')
          .select('franchise_id, espn_logo_url, season:seasons(year)')
          .not('espn_logo_url', 'is', null)
          .not('franchise_id', 'is', null),
        'Get ESPN team logos'
      ),
      unwrap(await ctx.client.from('league_franchises').select('id, owner_name'), 'Get franchise owners')
    ]);

    const logos = newestLogos(logoRows ?? []);
    const owners = new Map((franchises ?? []).map((row) => [row.id, row.owner_name]));
    const ids = new Set([...(rows ?? []).map((row) => row.franchise_id), ...logos.keys()]);
    const byFranchise = new Map((rows ?? []).map((row) => [row.franchise_id, row]));

    return Object.fromEntries(
      [...ids].map((franchiseId) => {
        const { player = null, ...row } = byFranchise.get(franchiseId) ?? { franchise_id: franchiseId };
        const profile = fromDbShape(row);
        const espnLogoUrl = logos.get(franchiseId) ?? null;
        return [
          franchiseId,
          {
            ...profile,
            ownerName: owners.get(franchiseId) ?? null,
            favoritePlayer: player ? fromDbShape(player) : null,
            espnLogoUrl,
            avatarUrl: resolveAvatarUrl(ctx, profile, espnLogoUrl)
          }
        ];
      })
    );
  } catch (error) {
    throwDbError(error, 'Get franchise profiles');
  }
}

function resolveAvatarUrl(ctx, profile, espnLogoUrl) {
  if (profile.avatarSource === 'espn') return espnLogoUrl;
  if (profile.avatarSource === 'upload' && profile.avatarPath) {
    return ctx.client.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatarPath).data.publicUrl;
  }
  return null;
}

/** The franchise this account may edit, or null. */
export async function getMyFranchiseId(ctx, userId) {
  try {
    const row = unwrap(
      await ctx.client
        .from('franchise_accounts')
        .select('franchise_id')
        .eq('user_id', userId)
        .maybeSingle(),
      'Get my franchise'
    );
    return row?.franchise_id ?? null;
  } catch (error) {
    throwDbError(error, 'Get my franchise');
  }
}

/**
 * Write the fields that changed. An upsert, because a franchise has no row
 * until the first save. `updated_at`, `updated_by` and a chosen player's name
 * are the trigger's, so they are not sent.
 */
export async function saveFranchiseProfile(ctx, franchiseId, patch) {
  try {
    return unwrap(
      await ctx.client
        .from('franchise_profiles')
        .upsert({ ...toDbShape(patch), franchise_id: franchiseId }, { onConflict: 'franchise_id' })
        .select()
        .single(),
      'Save franchise profile'
    );
  } catch (error) {
    throwDbError(error, 'Save franchise profile');
  }
}

/** Store a resized avatar and return its path; the profile row points at it after. */
export async function uploadAvatar(ctx, franchiseId, blob) {
  try {
    const extension = AVATAR_EXTENSIONS[blob.type] ?? 'jpg';
    const path = `${franchiseId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await ctx.client.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (error) throw error;
    return path;
  } catch (error) {
    throwDbError(error, 'Upload avatar');
  }
}

/**
 * Remove a replaced file. Best effort: the profile no longer points at it, so
 * a failure leaves an orphan and nothing a reader can see.
 */
export async function removeAvatarFile(ctx, path) {
  if (!path) return;
  const { error } = await ctx.client.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) log.warn('Could not remove a replaced avatar:', error.message);
}

/** Every link, for Settings -> Franchises. An admin reads them all; a member, their own. */
export async function listFranchiseAccounts(ctx) {
  try {
    const rows = unwrap(
      await ctx.client.from('franchise_accounts').select('user_id, franchise_id, linked_at'),
      'List franchise accounts'
    );
    return (rows ?? []).map(fromDbShape);
  } catch (error) {
    throwDbError(error, 'List franchise accounts');
  }
}

/**
 * Link an account to a franchise, or unlink it with a null franchise. The RPC
 * refuses anyone but an admin.
 */
export async function setFranchiseAccount(ctx, { userId, franchiseId }) {
  try {
    const { error } = await ctx.client.rpc('set_franchise_account', {
      p_user_id: userId,
      p_franchise_id: franchiseId ?? null
    });
    if (error) throw error;
    log.info(`franchise account: ${userId} -> ${franchiseId ?? 'none'}`);
  } catch (error) {
    throwDbError(error, 'Link account to franchise');
  }
}
