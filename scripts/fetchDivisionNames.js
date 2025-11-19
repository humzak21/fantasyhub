/**
 * Fetch Division Names Script
 *
 * Quick utility to fetch and display division names from ESPN for a given year.
 * This helps verify what the actual division names are in the ESPN API.
 *
 * Usage:
 *   node scripts/fetchDivisionNames.js <year>
 *   node scripts/fetchDivisionNames.js 2024
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import axios from 'axios';

const LEAGUE_ID = 67674700;

// Get ESPN auth from environment or use defaults
const ESPN_S2 = process.env.ESPN_S2 || 'AEC3%2FPztAlMbmNt8WTKIXFMiByC4lA3noGSUAQRDKEQlcB%2FSBXH3iovX7bEyLV%2FkxXMWiFE7BERZDzZiuSNO9QZBlduSaOZK8ZPxt8egsTAThWBZjCgWZCA02bBwtzrcuKfGdAz3G%2BA1fGEcOivJ1zXoLUKiv0uI%2FR7otMYC4hDMEIG5d8fvBdhg%2BmhLDkkUn%2B5ojL5MpdtqX2FwDheNAC0b5fTH4HcLgYXqFc3OhuNCfRdxf3MCygjFNpDDgUijbYT89vZUBzDh4CQD44Yux80FkA8ADnExCM2izaevNtpK62%2BUN1oxZvtmjHSgR6krK6HwmlQ5XEkzZPYSfr42aATk';
const SWID = process.env.SWID || '{F87751DE-01E7-4DEE-A904-FCD7DDA1948A}';

// Parse command line arguments
const year = parseInt(process.argv[2]);

if (!year || isNaN(year)) {
  console.error('❌ Error: Please provide a valid year');
  console.error('   Usage: node scripts/fetchDivisionNames.js <year>');
  console.error('   Example: node scripts/fetchDivisionNames.js 2024');
  process.exit(1);
}

// Create authenticated axios instance
const authenticatedAxios = axios.create({
  withCredentials: true,
  headers: {
    'Cookie': `espn_s2=${ESPN_S2}; SWID=${SWID};`
  }
});

async function fetchDivisionNames() {
  console.log('🏈 Fetching Division Names from ESPN');
  console.log('='.repeat(60));
  console.log(`   League ID: ${LEAGUE_ID}`);
  console.log(`   Year: ${year}`);
  console.log('='.repeat(60));

  try {
    const baseUrl = year >= 2018
      ? `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${LEAGUE_ID}`
      : `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}`;

    const isHistorical = year < 2018;
    const seasonParam = isHistorical ? `?seasonId=${year}` : '';
    const connector = isHistorical ? (seasonParam ? '&' : '?') : '?';

    // Fetch settings and teams
    const url = `${baseUrl}${seasonParam}${connector}view=mSettings&view=mTeam`;
    console.log(`\n📡 Fetching from: ${url.substring(0, 100)}...`);

    const response = await authenticatedAxios.get(url);
    const data = isHistorical ? response.data[0] : response.data;

    console.log('\n✅ Data fetched successfully!\n');

    // Check settings for division info
    console.log('📊 League Settings:');
    console.log('='.repeat(60));
    if (data.settings) {
      console.log(`League Name: ${data.settings.name || 'N/A'}`);
      console.log(`League Size: ${data.settings.size || 'N/A'}`);

      if (data.settings.scheduleSettings) {
        console.log(`Divisions: ${data.settings.scheduleSettings.divisions || 'N/A'}`);
        console.log(`Division Count: ${data.settings.scheduleSettings.divisionCount || 'N/A'}`);
      }
    }

    // Check for division data in settings
    console.log('\n📂 Division Data in Settings:');
    console.log('='.repeat(60));
    if (data.settings?.scheduleSettings?.divisions) {
      const divisions = data.settings.scheduleSettings.divisions;
      console.log(`Found ${Object.keys(divisions).length} divisions:`);
      Object.entries(divisions).forEach(([id, division]) => {
        console.log(`\nDivision ID: ${id}`);
        console.log(`  Name: ${division.name || 'N/A'}`);
        console.log(`  Size: ${division.size || 'N/A'}`);
        console.log(`  Full data:`, JSON.stringify(division, null, 2));
      });
    } else {
      console.log('⚠️  No division data found in settings.scheduleSettings.divisions');
    }

    // Check teams for division info
    console.log('\n👥 Team Division Assignments:');
    console.log('='.repeat(60));
    if (data.teams && data.teams.length > 0) {
      console.log(`Total teams: ${data.teams.length}\n`);

      const divisionMap = new Map();

      data.teams.forEach(team => {
        const teamName = team.name || team.abbrev || team.location || `Team ${team.id}`;
        const divisionId = team.divisionId;

        console.log(`Team: ${teamName}`);
        console.log(`  Division ID: ${divisionId !== undefined ? divisionId : 'N/A'}`);

        // Check for division name in team data
        if (team.division) {
          console.log(`  Division data:`, JSON.stringify(team.division, null, 2));
        }

        // Track which teams are in which division
        if (divisionId !== undefined && divisionId !== null) {
          if (!divisionMap.has(divisionId)) {
            divisionMap.set(divisionId, []);
          }
          divisionMap.get(divisionId).push(teamName);
        }

        console.log('');
      });

      console.log('\n📊 Division Summary:');
      console.log('='.repeat(60));
      if (divisionMap.size > 0) {
        divisionMap.forEach((teams, divId) => {
          console.log(`\nDivision ID ${divId}: ${teams.length} teams`);
          teams.forEach(t => console.log(`  - ${t}`));
        });
      } else {
        console.log('⚠️  No division assignments found in team data');
      }
    } else {
      console.log('❌ No teams found in response');
    }

    // Raw division field exploration
    console.log('\n🔍 Raw ESPN Data Structure Exploration:');
    console.log('='.repeat(60));
    console.log('Available top-level keys:', Object.keys(data));

    // Check if there's a separate divisions array or object
    if (data.divisions) {
      console.log('\n✅ Found data.divisions:');
      console.log(JSON.stringify(data.divisions, null, 2));
    }

    // Check schedule settings structure
    if (data.settings?.scheduleSettings) {
      console.log('\n📋 Full scheduleSettings structure:');
      console.log(JSON.stringify(data.settings.scheduleSettings, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.statusText}`);
    }
    process.exit(1);
  }
}

// Run the script
fetchDivisionNames()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
