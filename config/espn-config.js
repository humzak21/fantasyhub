// ⚠️  SECURITY: the espn_s2 / SWID pair below is a live credential for the
// ESPN account and it is committed to git. Deleting it here would not fix the
// exposure -- it must be rotated in ESPN and purged from history first.
// See REFACTOR_ANALYSIS.md §2.1. Left untouched deliberately so nothing
// silently breaks before that happens.
//
// leagueId / seasonYear are fallbacks only. The active season row owns them
// (seasons.espn_league_id, seasons.espn_season_year); scripts/weeklyUpdate.js
// reads the season first and only falls back to these.
export const ESPN_CONFIG = {
  leagueId: process.env.ESPN_LEAGUE_ID || '67674700',
  seasonYear: process.env.ESPN_SEASON_YEAR ? Number(process.env.ESPN_SEASON_YEAR) : null,

  espnS2: 'AEBoXofXcKKvF3uE2f1BtrqqRYGvo7yQOJx0zxWqULZn6oudDJ%2F1bUxWEz9eMlRQQXCxBMP2MQfaqWauuAAw0Po9q%2FFU%2Bd86ORXJegzeqva%2FunOqLQ5WVZB5LLO9KZbYzHZvZ0EsEFxgmZgDQHU9cIM9tXwK%2BRKEWCWvPdciVq4Kpx8OFMKaRS5CNU2OM3qwxGvE2MZ2Z1zvcsMIL82QxnxvMGb%2FACZHctYe3eQ1mt03ajdXvaI4Fb15gijorByEaqzxS14jMvDr9IPIdA3Hj8uGNqRjFzH4AHGaTDVQaFlZYSxL5U4mxjOHH7o0aQLpu57M8mXFIpqLu5f81WnMK2y4',
  swid: '{F87751DE-01E7-4DEE-A904-FCD7DDA1948A}'
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

console.log(USAGE_INSTRUCTIONS);
