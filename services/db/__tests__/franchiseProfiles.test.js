import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { getFranchiseProfiles, saveFranchiseProfile, setFranchiseAccount } from '../franchiseProfiles.js';

const OLD_LOGO = 'https://g.espncdn.com/old.svg';
const NEW_LOGO = 'https://g.espncdn.com/new.svg';

const ctxWith = ({ profiles = [], logos = [] } = {}) => {
  const ctx = makeCtx({
    'franchise_profiles.select': () => profiles,
    'teams.select': () => logos,
    'league_franchises.select': () => [{ id: 'f1', owner_name: 'Humza Khalil' }]
  });
  ctx.client.storage = {
    from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) })
  };
  return ctx;
};

describe('getFranchiseProfiles', () => {
  it('resolves an upload to its public URL', async () => {
    const profiles = await getFranchiseProfiles(
      ctxWith({ profiles: [{ franchise_id: 'f1', avatar_source: 'upload', avatar_path: 'f1/a.webp', bio: 'Hi' }] })
    );

    expect(profiles.f1).toMatchObject({
      bio: 'Hi',
      ownerName: 'Humza Khalil',
      avatarUrl: 'https://cdn.test/f1/a.webp'
    });
  });

  it('points an ESPN avatar at the newest logo', async () => {
    const profiles = await getFranchiseProfiles(
      ctxWith({
        profiles: [{ franchise_id: 'f1', avatar_source: 'espn', avatar_path: null }],
        logos: [
          { franchise_id: 'f1', espn_logo_url: NEW_LOGO, season: { year: 2026 } },
          { franchise_id: 'f1', espn_logo_url: OLD_LOGO, season: { year: 2025 } }
        ]
      })
    );

    expect(profiles.f1.avatarUrl).toBe(NEW_LOGO);
  });

  it('offers a logo to a franchise with no profile, without drawing it', async () => {
    const profiles = await getFranchiseProfiles(
      ctxWith({ logos: [{ franchise_id: 'f1', espn_logo_url: NEW_LOGO, season: { year: 2026 } }] })
    );

    expect(profiles.f1).toMatchObject({ espnLogoUrl: NEW_LOGO, avatarUrl: null });
  });

  it('draws nothing with no avatar chosen', async () => {
    const profiles = await getFranchiseProfiles(ctxWith({ profiles: [{ franchise_id: 'f1', bio: 'Hi' }] }));
    expect(profiles.f1.avatarUrl).toBeNull();
  });
});

describe('saveFranchiseProfile', () => {
  it('upserts on the franchise, in the database shape', async () => {
    const ctx = makeCtx({ 'franchise_profiles.upsert': ({ payload }) => payload });

    await saveFranchiseProfile(ctx, 'f1', { favoriteNflTeam: 'BUF', accentHue: 240 });

    expect(ctx.client.callsFor('franchise_profiles', 'upsert')[0].payload).toEqual({
      franchise_id: 'f1',
      favorite_nfl_team: 'BUF',
      accent_hue: 240
    });
  });
});

describe('setFranchiseAccount', () => {
  it('sends a null franchise to unlink', async () => {
    const ctx = makeCtx({ 'rpc.set_franchise_account': () => null });

    await setFranchiseAccount(ctx, { userId: 'u1', franchiseId: null });

    expect(ctx.client.callsFor('rpc', 'set_franchise_account')[0].payload).toEqual({
      p_user_id: 'u1',
      p_franchise_id: null
    });
  });
});
