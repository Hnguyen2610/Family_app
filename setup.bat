@echo off
REM Family Calendar + AI Assistant - Setup Script for Windows

echo.
echo 🚀 Family Calendar + AI Assistant - Setup Script
echo ==================================================
echo.

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 18+
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js %NODE_VERSION%

REM Check npm
echo Checking npm...
npm --version >nul 2>&1
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✓ npm %NPM_VERSION%

REM Backend setup
echo.
echo Setting up Backend...
cd backend

if not exist "node_modules" (
    echo Installing backend dependencies...
    call npm install
)

if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
    echo ⚠️  Please update backend\.env with your database and OpenAI credentials
)

echo ✓ Backend setup complete
cd ..

REM Frontend setup
echo.
echo Setting up Frontend...
cd frontend

if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)

if not exist ".env.local" (
    echo Creating .env.local file...
    copy .env.example .env.local
)

echo ✓ Frontend setup complete
cd ..

REM Summary
echo.
echo ==================================================
echo ✓ Setup Complete!
echo ==================================================
echo.
echo Next steps:
echo.
echo 1. Update environment variables:
echo    - backend\.env
echo    - frontend\.env.local
echo.
echo 2. Run the application:
echo.
echo    Option A - Docker Compose (recommended):
echo      docker-compose up
echo.
echo    Option B - Manual (two command prompts):
echo      Command Prompt 1 (Backend):
echo        cd backend
echo        npm run start:dev
echo.
echo      Command Prompt 2 (Frontend):
echo        cd frontend
echo        npm run dev
echo.
echo 3. Open browser:
echo    http://localhost:3000
echo.
echo 4. API documentation:
echo    http://localhost:3001 (health check)
echo.
echo For more information, see:
echo   - README.md (Project overview)
echo   - backend\README.md (Backend setup)
echo   - frontend\README.md (Frontend setup)
echo   - DEPLOYMENT.md (Production deployment)
echo.
pause
