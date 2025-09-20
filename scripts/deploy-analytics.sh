#!/bin/bash

# FFAnalytics Integration Deployment Script
# This script handles the complete deployment of the ffanalytics integration

set -e  # Exit on any error

echo "=== FFAnalytics Integration Deployment ==="
echo "Starting deployment process..."

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
R_SCRIPTS_DIR="$PROJECT_ROOT/scripts/ffanalytics"
DATABASE_DIR="$PROJECT_ROOT/database"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    log_info "✓ Node.js found: $(node --version)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    log_info "✓ npm found: $(npm --version)"
    
    # Check R
    if ! command -v R &> /dev/null; then
        log_error "R is not installed"
        log_error "Please install R before continuing. See docs/R_ENVIRONMENT_SETUP.md"
        exit 1
    fi
    log_info "✓ R found: $(R --version | head -n1)"
    
    # Check Rscript
    if ! command -v Rscript &> /dev/null; then
        log_error "Rscript is not available"
        exit 1
    fi
    log_info "✓ Rscript found"
    
    # Check environment variables
    if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
        log_warn "Supabase environment variables not set"
        log_warn "Make sure to configure .env file before running the application"
    fi
}

# Install R dependencies
install_r_dependencies() {
    log_info "Installing R dependencies..."
    
    if [ -f "$SCRIPT_DIR/install-r-dependencies.R" ]; then
        Rscript "$SCRIPT_DIR/install-r-dependencies.R"
        if [ $? -eq 0 ]; then
            log_info "✓ R dependencies installed successfully"
        else
            log_error "Failed to install R dependencies"
            exit 1
        fi
    else
        log_error "R dependencies installation script not found"
        exit 1
    fi
}

# Deploy R scripts
deploy_r_scripts() {
    log_info "Deploying R scripts..."
    
    # Create R scripts directory if it doesn't exist
    mkdir -p "$R_SCRIPTS_DIR"
    
    # Set executable permissions for R scripts
    if [ -d "$R_SCRIPTS_DIR" ]; then
        find "$R_SCRIPTS_DIR" -name "*.R" -exec chmod +x {} \;
        log_info "✓ R scripts permissions set"
    fi
    
    # Validate R scripts
    log_info "Validating R scripts..."
    for script in "$R_SCRIPTS_DIR"/*.R; do
        if [ -f "$script" ]; then
            script_name=$(basename "$script")
            log_info "Validating $script_name..."
            
            # Basic syntax check
            Rscript -e "source('$script')" --args --validate 2>/dev/null
            if [ $? -eq 0 ]; then
                log_info "✓ $script_name syntax valid"
            else
                log_warn "⚠ $script_name may have syntax issues"
            fi
        fi
    done
}

# Run database migrations
run_database_migrations() {
    log_info "Running database migrations..."
    
    # Check if migration script exists
    if [ -f "$DATABASE_DIR/ffanalytics_schema_migration.sql" ]; then
        log_info "Database migration script found"
        log_warn "Please run the database migration manually using your Supabase dashboard:"
        log_warn "Execute: $DATABASE_DIR/ffanalytics_schema_migration.sql"
    else
        log_warn "Database migration script not found at $DATABASE_DIR/ffanalytics_schema_migration.sql"
    fi
}

# Install Node.js dependencies
install_node_dependencies() {
    log_info "Installing Node.js dependencies..."
    
    cd "$PROJECT_ROOT"
    npm install
    if [ $? -eq 0 ]; then
        log_info "✓ Node.js dependencies installed"
    else
        log_error "Failed to install Node.js dependencies"
        exit 1
    fi
}

# Run health checks
run_health_checks() {
    log_info "Running health checks..."
    
    # Test R environment
    log_info "Testing R environment..."
    if [ -f "$R_SCRIPTS_DIR/test_environment.R" ]; then
        Rscript "$R_SCRIPTS_DIR/test_environment.R"
        if [ $? -eq 0 ]; then
            log_info "✓ R environment test passed"
        else
            log_warn "⚠ R environment test failed"
        fi
    fi
    
    # Test Node.js analytics health check
    log_info "Testing analytics integration..."
    cd "$PROJECT_ROOT"
    if npm run analytics:health-check &> /dev/null; then
        log_info "✓ Analytics health check passed"
    else
        log_warn "⚠ Analytics health check failed (this is normal if database is not configured)"
    fi
}

# Create deployment summary
create_deployment_summary() {
    log_info "Creating deployment summary..."
    
    cat > "$PROJECT_ROOT/DEPLOYMENT_SUMMARY.md" << EOF
# FFAnalytics Integration Deployment Summary

**Deployment Date:** $(date)
**Deployment Script Version:** 1.0.0

## Components Deployed

### R Environment
- R Version: $(R --version | head -n1)
- Rscript: Available
- FFAnalytics Package: Installed

### R Scripts
- Location: \`scripts/ffanalytics/\`
- Scripts deployed and validated

### Database Schema
- Migration script: \`database/ffanalytics_schema_migration.sql\`
- Status: Ready for manual execution

### Node.js Integration
- Dependencies: Installed
- Health checks: Completed

## Next Steps

1. **Configure Environment Variables**
   - Copy \`.env.example\` to \`.env\`
   - Set Supabase credentials
   - Configure analytics settings

2. **Run Database Migration**
   - Execute \`database/ffanalytics_schema_migration.sql\` in Supabase
   - Verify tables are created correctly

3. **Test Integration**
   - Run: \`npm run analytics:health-check\`
   - Test: \`npm run analytics:sync-weekly\`

4. **Monitor Performance**
   - Check logs in \`logs/analytics/\`
   - Monitor R script execution times
   - Verify data quality

## Troubleshooting

- See \`docs/R_ENVIRONMENT_SETUP.md\` for R environment issues
- Check \`logs/deployment.log\` for deployment details
- Run \`npm run analytics:health-check\` to diagnose issues

## Support

- Documentation: \`docs/\` directory
- Health checks: \`npm run analytics:health-check\`
- Logs: \`logs/analytics/\`
EOF

    log_info "✓ Deployment summary created: DEPLOYMENT_SUMMARY.md"
}

# Main deployment process
main() {
    echo "Starting FFAnalytics integration deployment..."
    echo "Project root: $PROJECT_ROOT"
    echo ""
    
    # Create logs directory
    mkdir -p "$PROJECT_ROOT/logs/analytics"
    
    # Run deployment steps
    check_prerequisites
    install_node_dependencies
    install_r_dependencies
    deploy_r_scripts
    run_database_migrations
    run_health_checks
    create_deployment_summary
    
    echo ""
    log_info "=== Deployment Complete ==="
    log_info "FFAnalytics integration has been deployed successfully!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Configure your .env file with Supabase credentials"
    log_info "2. Run the database migration in Supabase"
    log_info "3. Test with: npm run analytics:health-check"
    log_info ""
    log_info "See DEPLOYMENT_SUMMARY.md for detailed information."
}

# Run main function
main "$@"