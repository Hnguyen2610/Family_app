#!/bin/bash

echo "🚀 Family Calendar + AI Assistant - Setup Script"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# Check npm
echo -e "${YELLOW}Checking npm...${NC}"
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm ${NPM_VERSION}${NC}"

# Backend setup
echo ""
echo -e "${YELLOW}Setting up Backend...${NC}"
cd backend

if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo -e "${YELLOW}Please update backend/.env with your database and OpenAI credentials${NC}"
fi

echo -e "${GREEN}✓ Backend setup complete${NC}"

# Frontend setup
echo ""
echo -e "${YELLOW}Setting up Frontend...${NC}"
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

if [ ! -f ".env.local" ]; then
    echo "Creating .env.local file..."
    cp .env.example .env.local
fi

echo -e "${GREEN}✓ Frontend setup complete${NC}"

# Summary
echo ""
echo "=================================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=================================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Update environment variables:"
echo "   - backend/.env"
echo "   - frontend/.env.local"
echo ""
echo "2. Run the application:"
echo "   Option A - Docker Compose (recommended):"
echo "     ${YELLOW}docker-compose up${NC}"
echo ""
echo "   Option B - Manual (two terminals):"
echo "     Terminal 1 (Backend):"
echo "       ${YELLOW}cd backend && npm run start:dev${NC}"
echo ""
echo "     Terminal 2 (Frontend):"
echo "       ${YELLOW}cd frontend && npm run dev${NC}"
echo ""
echo "3. Open browser:"
echo "   ${YELLOW}http://localhost:3000${NC}"
echo ""
echo "4. API documentation:"
echo "   ${YELLOW}http://localhost:3001${NC} (health check)"
echo ""
echo "For more information, see:"
echo "  - README.md (Project overview)"
echo "  - backend/README.md (Backend setup)"
echo "  - frontend/README.md (Frontend setup)"
echo "  - DEPLOYMENT.md (Production deployment)"
echo ""
