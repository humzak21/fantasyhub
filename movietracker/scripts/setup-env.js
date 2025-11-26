#!/usr/bin/env node

/**
 * Environment Setup Script
 * Helps users set up their environment files for development
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function copyEnvFile(source, destination, name) {
  if (fs.existsSync(destination)) {
    const overwrite = await ask(`${destination} already exists. Overwrite? (y/N): `);
    if (overwrite.toLowerCase() !== 'y') {
      console.log(`Skipping ${name} environment file.`);
      return false;
    }
  }

  try {
    fs.copyFileSync(source, destination);
    console.log(`✅ Created ${name} environment file: ${destination}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create ${name} environment file:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Movie Tracker Environment Setup\n');
  
  const envFiles = [
    {
      source: 'env.example',
      destination: '.env',
      name: 'Frontend'
    },
    {
      source: 'backend/env.example',
      destination: 'backend/.env',
      name: 'Backend'
    }
  ];

  let created = 0;
  
  for (const { source, destination, name } of envFiles) {
    if (fs.existsSync(source)) {
      const success = await copyEnvFile(source, destination, name);
      if (success) created++;
    } else {
      console.log(`⚠️  Template file ${source} not found, skipping ${name}`);
    }
  }

  console.log(`\n📝 Environment Setup Complete!`);
  console.log(`Created ${created} environment files.`);
  
  if (created > 0) {
    console.log('\n🔧 Next Steps:');
    console.log('1. Edit the .env files with your actual credentials:');
    console.log('   - Supabase URL and keys');
    console.log('   - TMDB API key');
    console.log('2. Run: npm run dev:full');
    console.log('3. Visit: http://localhost:3000');
  }

  console.log('\n📚 Need help?');
  console.log('- Check README.md for detailed instructions');
  console.log('- Visit: https://github.com/your-username/movietracker');
  
  rl.close();
}

main().catch(console.error); 