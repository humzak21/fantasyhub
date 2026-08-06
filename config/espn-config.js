// ESPN credentials come from the environment. Nothing secret lives in this
// file -- see `.env.example` for the variables and
// `.github/workflows/sync-week.yml` for how the scheduled sync supplies them.
//
// leagueId / seasonYear are fallbacks only. The active season row owns them
// (seasons.espn_league_id, seasons.espn_season_year); scripts/sync-week.js
// reads the season first and only falls back to these.

/**
 * ESPN issues SWID as a brace-wrapped UUID, and the braces are easy to lose
 * when copying the cookie into a secret store or an .env file. The value is
 * interpolated straight into a Cookie header (`SWID=${swid}`), so the stored
 * form reaches ESPN verbatim.
 *
 * Both forms were tested against the live league and both authenticate, so this
 * is normalisation toward the canonical form rather than a fix for a break —
 * it just means the stored value can be pasted either way without anyone having
 * to know which.
 */
const normaliseSwid = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed : `{${trimmed.replace(/^\{|\}$/g, '')}}`;
};

export const ESPN_CONFIG = {
  leagueId: process.env.ESPN_LEAGUE_ID || '67674700',
  seasonYear: process.env.ESPN_SEASON_YEAR ? Number(process.env.ESPN_SEASON_YEAR) : null,

  espnS2: process.env.ESPN_S2 || null,
  swid: normaliseSwid(process.env.ESPN_SWID)
};

/**
 * Private-league requests need both cookies. Callers that need to fail loudly
 * rather than silently fetching a public-league shape should call this.
 */
export const requireEspnCredentials = () => {
  const missing = ['ESPN_S2', 'ESPN_SWID'].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `Missing ESPN credentials: ${missing.join(', ')}. ` +
      'Set them in .env.local locally, or as repository secrets for the scheduled sync.'
    );
  }
  return { espnS2: ESPN_CONFIG.espnS2, swid: ESPN_CONFIG.swid };
};

export const USAGE_INSTRUCTIONS = `
🏈 ESPN Fantasy Football Roster Updater Setup
============================================

Step 1: Find Your League ID
---------------------------
1. Go to your ESPN Fantasy Football league
2. Look at the URL, it should look like:
   https://fantasy.espn.com/football/league?leagueId=123456&seasonId=2024
3. Your league ID is the number after "leagueId=" (e.g., 123456)

Step 2: Get Cookies (for Private Leagues Only)
----------------------------------------------
If your league is private, you need authentication cookies:

1. Go to your ESPN fantasy league in a web browser
2. Make sure you're logged in to ESPN
3. Open Developer Tools:
   - Chrome/Edge: Press F12 or Ctrl+Shift+I
   - Firefox: Press F12 or Ctrl+Shift+I
   - Safari: Cmd+Option+I
4. Go to the "Application" tab (Chrome/Edge) or "Storage" tab (Firefox)
5. In the left sidebar, expand "Cookies" and click on "https://espn.com"
6. Find these two cookies:
   - espn_s2: Copy the entire value (very long string)
   - SWID: Copy the value (shorter string with curly braces)

Step 3: Configure the Script
---------------------------
1. Copy this file to: config/espn-config.js
2. Replace the placeholder values:
   - YOUR_LEAGUE_ID_HERE: Your actual league ID
   - YOUR_ESPN_S2_COOKIE_HERE: The espn_s2 cookie value
   - YOUR_SWID_COOKIE_HERE: The SWID cookie value

Step 4: Test Connection
----------------------
Run: node scripts/updateRosters.js test

Step 5: Update Rosters
---------------------
Run: node scripts/updateRosters.js update

⚠️  Important Notes:
- Keep your cookies private! Don't share them or commit them to git
- Cookies expire periodically, you may need to update them
- For public leagues, you only need the league ID
- The script matches teams by owner name, make sure they match between ESPN and your system

📅 Weekly Usage:
Run this command weekly to keep rosters updated:
node scripts/updateRosters.js weekly
`;

// Printing on import used to spray this banner into every script and job that
// merely read a league id. Callers that want it call printUsage().
export function printUsage() {
  console.log(USAGE_INSTRUCTIONS);
}
