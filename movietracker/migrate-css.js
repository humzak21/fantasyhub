#!/usr/bin/env node

/**
 * CSS Migration Script
 * 
 * This script helps extract and organize CSS from the original index.css file
 * into the modular structure we've created.
 * 
 * Usage: node migrate-css.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the original CSS file
const originalCss = fs.readFileSync('src/index.css', 'utf8');

// Define the mapping of CSS selectors to modules
const moduleMapping = {
  'components/cards.css': [
    '.stats-grid', '.stat-card', '.stat-number', '.stat-label', '.movie-grid', 
    '.movie-card', '.movie-poster', '.movie-info', '.movie-header', '.movie-title',
    '.movie-year', '.movie-ratings', '.movie-date', '.movie-meta', '.movie-rating',
    '.chart-container', '.chart-title', '.review-cards-grid', '.review-card',
    '.card-icon-wrapper', '.card-value-section', '.card-primary-value', 
    '.card-secondary-value', '.card-empty-state', '.score-value'
  ],
  
  'components/forms.css': [
    '.filters', '.filter-select', '.search-input', '.apple-input', '.tag-input',
    '.percentage-input', '.percentage-symbol', '.percentage-rating-container',
    '.watched-date-container', '.watched-date-input', '.watched-date-display',
    '.filter-input-group', '.filter-input', '.filter-input-label'
  ],
  
  'components/ratings.css': [
    '.star-rating', '.star-rating-container', '.star-rating-stars', '.star-container',
    '.star-background', '.star-foreground', '.star-click-area', '.star-rating-btn',
    '.star-rating-value', '.detailed-rating', '.star-rating-display', '.star-glyph',
    '.percentage-range-hint'
  ],
  
  'components/tags.css': [
    '.tags-container', '.tags-list', '.tag-item', '.tag-remove', '.tags-edit-section',
    '.tags-mini-list', '.tag-mini', '.tag-remove-mini', '.tags-more-mini',
    '.tags-display-section', '.tag-value', '.card-tag-item'
  ],
  
  'components/indicators.css': [
    '.rewatch-indicator', '.rewatch-button', '.rewatch-display', '.rewatch-toggle-container',
    '.rewatch-toggle-btn', '.timeline-rewatch-indicator', '.timeline-rewatch-icon',
    '.timeline-review-icon'
  ],
  
  'components/navigation.css': [
    '.user-dropdown', '.user-dropdown-btn', '.user-dropdown-menu', '.user-dropdown-header',
    '.user-email', '.commit-message', '.user-dropdown-item', '.user-dropdown-signout',
    '.user-dropdown-chevron', '.user-dropdown-divider'
  ],
  
  'features/timeline.css': [
    '.timeline', '.timeline-header', '.timeline-filters', '.timeline-content',
    '.timeline-day', '.timeline-movie-card', '.timeline-movie-poster', '.timeline-movie-info',
    '.timeline-movie-title', '.timeline-movie-year', '.timeline-load-more', '.timeline-end',
    '.timeline-empty-state', '.timeline-search-input', '.timeline-filter-select'
  ],
  
  'features/login.css': [
    '.login-modal-overlay', '.login-modal', '.login-modal-close', '.login-modal-header',
    '.login-modal-form', '.login-form-group', '.login-input-wrapper', '.login-submit-btn',
    '.login-error', '.login-success', '.login-pill', '.login-pill-btn'
  ],
  
  'features/add-movie.css': [
    '.add-movie-modal-overlay', '.add-movie-modal', '.add-movie-modal-close',
    '.add-movie-modal-header', '.add-movie-modal-form', '.add-movie-form-group',
    '.add-movie-input-wrapper', '.add-movie-textarea', '.add-movie-submit-btn',
    '.movie-search-container', '.search-results', '.search-result-item',
    '.selected-movie-display', '.add-movie-success', '.add-movie-error'
  ],
  
  'features/movie-details.css': [
    '.movie-details-modal-overlay', '.movie-details-modal', '.movie-details-header',
    '.movie-details-content', '.movie-details-poster', '.movie-details-info',
    '.movie-details-title', '.movie-details-year', '.movie-details-overview',
    '.movie-details-metadata', '.movie-details-user-data', '.movie-details-field',
    '.movie-details-input', '.movie-details-textarea', '.movie-details-edit-btn',
    '.movie-details-save-btn', '.movie-details-cancel-btn'
  ],
  
  'features/rating-comparison.css': [
    '.rating-comparison-overlay', '.rating-comparison-modal', '.rating-comparison-header',
    '.rating-comparison-content', '.rating-comparison-list', '.rating-comparison-item',
    '.rating-comparison-movie-info', '.rating-comparison-title', '.rating-comparison-rating',
    '.rating-comparison-error', '.rating-comparison-empty'
  ],
  
  'features/statistics.css': [
    '.statistics-title', '.statistics-subtitle', '.statistics-sections', 
    '.statistics-cards-grid', '.stat-card-modern', '.stats-hero', '.stats-compact-card',
    '.stats-card-icon', '.stats-card-content', '.stats-card-header', '.stats-card-title',
    '.stats-card-value', '.stats-mini-chart', '.stats-pie-card', '.stats-apple-pie-container',
    '.stats-tooltip', '.stats-animated-chart'
  ],
  
  'features/dark-mode.css': [
    '.dark-mode-toggle-container', '.dark-mode-toggle-wrapper', '.dark-mode-toggle-trigger',
    '.dark-mode-toggle-pill', '.dark-mode-toggle-pill-wrapper'
  ],
  
  'features/filters.css': [
    '.filters-container', '.search-filter-wrapper', '.search-input-wrapper',
    '.search-input-modern', '.search-icon', '.search-clear-btn', '.filter-pills-container',
    '.filter-pill', '.filter-pill-select', '.filter-pill-input', '.filter-pill-number-input'
  ]
};

/**
 * Extract CSS rules for specific selectors
 */
function extractCssForSelectors(css, selectors) {
  const rules = [];
  
  selectors.forEach(selector => {
    // Escape dots and other special regex characters
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create a more robust regex that captures the full rule including nested rules
    const regex = new RegExp(`(${escapedSelector}(?:[^{]*|\\s*)\\{(?:[^{}]*|\\{[^{}]*\\})*\\})`, 'gs');
    const matches = css.match(regex);
    
    if (matches) {
      rules.push(...matches);
    }
  });
  
  return rules.join('\n\n');
}

/**
 * Main migration function
 */
function migrateCss() {
  console.log('🚀 Starting CSS migration...\n');
  
  Object.entries(moduleMapping).forEach(([modulePath, selectors]) => {
    const filePath = path.join('src/styles', modulePath);
    
    console.log(`📝 Processing ${modulePath}...`);
    
    // Extract CSS for this module
    const extractedCss = extractCssForSelectors(originalCss, selectors);
    
    if (extractedCss.trim()) {
      // Append to existing file (don't overwrite our base files)
      const existingContent = fs.readFileSync(filePath, 'utf8').trim();
      const newContent = existingContent + '\n\n' + extractedCss;
      
      fs.writeFileSync(filePath, newContent);
      console.log(`  ✅ Added ${selectors.length} selector patterns to ${modulePath}`);
    } else {
      console.log(`  ⚠️  No CSS found for ${modulePath} selectors`);
    }
  });
  
  console.log('\n✨ Migration complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Review the generated files and clean up any duplicates');
  console.log('2. Test the application to ensure all styles are working');
  console.log('3. Update your main HTML to use src/styles/index.css');
  console.log('4. Remove or rename the original src/index.css file');
}

// Run the migration
migrateCss(); 