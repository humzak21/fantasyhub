#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Without this the check below reads an empty process.env and always reports
// the credentials as missing.
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * `config/espn-config.js` is committed and is a pure environment loader, so
 * there is no config file to generate any more. This used to write a template
 * that hardcoded the real espn_s2 / SWID pair, the 2025 season and the league
 * id -- a second live copy of the credential, and one that would have undone
 * the move to environment variables for anyone who ran it. (It was also
 * syntactically invalid: the values were emitted unquoted.)
 *
 * Setup is now "put the two cookies in .env.local", which this checks for.
 */
function checkCredentials() {
  const envPath = path.join(__dirname, '../.env.local');
  const present = (name) => Boolean(process.env[name]);

  if (!fs.existsSync(envPath)) {
    console.log('⚠️  No .env.local found. Copy .env.example to .env.local and fill it in.');
    return;
  }

  const missing = ['ESPN_S2', 'ESPN_SWID'].filter((name) => !present(name));
  if (missing.length === 0) {
    console.log('✅ ESPN_S2 and ESPN_SWID are set.');
  } else {
    console.log(`⚠️  Missing in the environment: ${missing.join(', ')}`);
    console.log('   Add them to .env.local (see .env.example).');
  }
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
  
  checkCredentials();
  console.log('');
  showInstructions();
}


// Only run when executed directly. Importing this module must not touch
// production — see aug2026_refactor/07-frontend.md §7.
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) main();