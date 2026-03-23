# Quick Start Commands

## Setup
```bash
# Unix/Linux/Mac
bash setup.sh

# Windows
setup.bat

# Docker
docker-compose up
```

## Backend
```bash
cd backend

# Install
npm install

# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Database
npm run db:migrate      # Run migrations
npm run db:seed         # Seed data
npm run db:studio       # Visual database editor
```

## Frontend
```bash
cd frontend

# Install
npm install

# Development
npm run dev             # http://localhost:3000

# Build
npm run build

# Production
npm start

# Lint & Format
npm run lint
npm run format
npm run type-check
```

## Testing

### Backend
```bash
npm run test            # Run tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage
npm run test:debug     # Debug mode
```

### E2E Tests
```bash
npm run test:e2e        # Run e2e tests
```

## Database

### Migrations
```bash
npm run db:migrate              # Create migration
npm run db:push                 # Push schema
npx prisma migrate dev          # Interactive migration
```

### Access Database
```bash
npm run db:studio       # Prisma Studio
```

## Debugging

### Backend
```bash
npm run start:debug     # Node debugger
```

### Frontend
- Open DevTools (F12)
- Check Network tab for API calls
- Check Console for errors

## Common Issues

### Port already in use
```bash
# Mac/Linux - Kill port 3001
lsof -ti:3001 | xargs kill -9

# Windows - Kill port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Database connection error
```bash
# Check PostgreSQL is running
# Verify DATABASE_URL in .env
# Reset database
npm run db:push
npm run db:seed
```

### API not responding
- Backend running on 3001?
- Check CORS settings
- Verify API_URL in frontend .env

## Deployment

### Deploy to Vercel (Frontend)
```bash
npm install -g vercel
vercel
```

### Deploy to Railway (Backend)
```bash
# Push to GitHub
git push origin main
# Railway auto-deploys from GitHub
```

## Troubleshooting

See DEPLOYMENT.md for full troubleshooting guide.
