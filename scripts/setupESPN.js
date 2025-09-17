#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createConfigFile() {
  const configDir = path.join(__dirname, '../config');
  const configPath = path.join(configDir, 'espn-config.js');
  const examplePath = path.join(configDir, 'espn-config.example.js');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (fs.existsSync(configPath)) {
    console.log('✅ ESPN config file already exists at config/espn-config.js');
    return;
  }

  const configTemplate = `export const ESPN_CONFIG = {
  // Required: Your ESPN Fantasy Football League ID
  // Find this in your league URL: fantasy.espn.com/football/league?leagueId=YOUR_ID_HERE
  leagueId: 67674700,  // e.g., 123456
  
  // Required: Current season year
  seasonYear: 2025,
  
  // Required for Private Leagues: ESPN authentication cookies
  // Leave as null for public leagues
  espnS2: AEBoXofXcKKvF3uE2f1BtrqqRYGvo7yQOJx0zxWqULZn6oudDJ%2F1bUxWEz9eMlRQQXCxBMP2MQfaqWauuAAw0Po9q%2FFU%2Bd86ORXJegzeqva%2FunOqLQ5WVZB5LLO9KZbYzHZvZ0EsEFxgmZgDQHU9cIM9tXwK%2BRKEWCWvPdciVq4Kpx8OFMKaRS5CNU2OM3qwxGvE2MZ2Z1zvcsMIL82QxnxvMGb%2FACZHctYe3eQ1mt03ajdXvaI4Fb15gijorByEaqzxS14jMvDr9IPIdA3Hj8uGNqRjFzH4AHGaTDVQaFlZYSxL5U4mxjOHH7o0aQLpu57M8mXFIpqLu5f81WnMK2y4,  // Long string from espn_s2 cookie
  swid: {F87751DE-01E7-4DEE-A904-FCD7DDA1948A}     // String with curly braces from SWID cookie
};

// Instructions for finding your cookies (private leagues only):
/*
1. Go to your ESPN fantasy league in browser
2. Open Developer Tools (F12)
3. Go to Application > Cookies > espn.com
4. Copy values for 'espn_s2' and 'SWID' cookies
5. Paste them above (keep the quotes!)
*/
`;

  fs.writeFileSync(configPath, configTemplate);
  console.log('✅ Created ESPN config file at config/espn-config.js');
  console.log('📝 Please edit the file and add your league details');
}

function showInstructions() {
  console.log(`
🏈 ESPN Fantasy Football Roster Updater Setup
============================================

This tool will sync player rosters from ESPN to your fantasy app weekly.

Setup Steps:
-----------

1️⃣  Find Your League ID:
   • Go to your ESPN fantasy league
   • Check the URL: fantasy.espn.com/football/league?leagueId=XXXXXX
   • Your League ID is the number after "leagueId="

2️⃣  Edit Configuration:
   • Open: config/espn-config.js
   • Set your leagueId
   • For private leagues, add cookies (see instructions in file)

3️⃣  Test Connection:
   node scripts/updateRosters.js test

4️⃣  Update Rosters:
   node scripts/updateRosters.js update

Weekly Usage:
------------
Run this command weekly to keep rosters synchronized:
   node scripts/updateRosters.js weekly

Team Matching:
-------------
The script matches teams by owner names. Make sure owner names in your
fantasy app match the names in ESPN (or are similar enough).

Use this to see team matching:
   node scripts/updateRosters.js report

Need Help?
---------
• Run 'node scripts/updateRosters.js' for usage help
• Check config/espn-config.example.js for detailed setup instructions
`);
}

function main() {
  console.log('🔧 Setting up ESPN Fantasy Football Roster Updater...\n');
  
  createConfigFile();
  console.log('');
  showInstructions();
}

main();