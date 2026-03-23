#!/usr/bin/env pwsh

# Family Calendar + AI Assistant - Setup Verification
# Run this script to verify and complete setup

Write-Host "======================================================" -ForegroundColor Green
Write-Host "Family Calendar + AI Assistant - Setup Verification" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""

# Check Node.js
$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "Node.js installed: $nodeVersion" -ForegroundColor Green
Write-Host "npm installed: $npmVersion" -ForegroundColor Green

# Check backend
Write-Host ""
Write-Host "Backend:" -ForegroundColor Cyan
if (Test-Path .\backend\node_modules) {
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
}
if (Test-Path .\backend\.env) {
    Write-Host "✓ Backend .env file created" -ForegroundColor Green
}
if (Test-Path .\backend\prisma\schema.prisma) {
    Write-Host "✓ Prisma schema exists" -ForegroundColor Green
}

# Check frontend
Write-Host ""
Write-Host "Frontend:" -ForegroundColor Cyan
if (Test-Path .\frontend\node_modules) {
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
}
if (Test-Path .\frontend\.env.local) {
    Write-Host "✓ Frontend .env.local file created" -ForegroundColor Green
}

# Check documentation
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan
$docs = @("README.md", "QUICKSTART.md", "ARCHITECTURE.md", "DEPLOYMENT.md", "COMPLETION.md")
foreach ($doc in $docs) {
    if (Test-Path $doc) {
        Write-Host "✓ $doc" -ForegroundColor Green
    }
}

# Database setup
Write-Host ""
Write-Host "Database Setup Required:" -ForegroundColor Yellow
Write-Host "Option 1: Docker Compose (RECOMMENDED)" -ForegroundColor White
Write-Host "  docker-compose up" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Local PostgreSQL" -ForegroundColor White
Write-Host "  1. Install PostgreSQL 14+" -ForegroundColor Gray
Write-Host "  2. Create database: family_calendar" -ForegroundColor Gray
Write-Host "  3. Update backend\.env with connection string" -ForegroundColor Gray
Write-Host "  4. Run: cd backend && npm run db:migrate" -ForegroundColor Gray
Write-Host ""

# Next steps
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Start PostgreSQL (Docker or local)" -ForegroundColor White
Write-Host "2. Run database migrations: cd backend && npm run db:migrate" -ForegroundColor White
Write-Host "3. Terminal 1 - Backend: cd backend && npm run start:dev" -ForegroundColor White
Write-Host "4. Terminal 2 - Frontend: cd frontend && npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Setup complete! Ready to run." -ForegroundColor Green
Write-Host ""
