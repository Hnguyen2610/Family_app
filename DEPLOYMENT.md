# Family Calendar + AI Assistant - Deployment Guide

Complete guide for deploying the full-stack application to production.

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │        ┌──────────────────┐
│   (Vercel)      │───────→│  Backend API     │
│   Next.js       │        │  (Railway)       │
│   Port: 3000    │        │  NestJS          │
└─────────────────┘        │  Port: 3001      │
                           └──────────────────┘
                                   │
                                   ↓
                           ┌──────────────────┐
                           │  PostgreSQL      │
                           │  (Railway)       │
                           │  Database        │
                           └──────────────────┘
```

## Prerequisites

1. **GitHub Account**: For hosting code and CI/CD
2. **Vercel Account**: For frontend deployment
3. **Railway Account**: For backend and database
4. **OpenAI API Key**: For AI features
5. **Domain Name** (optional): For custom domain

## Step 1: Database Setup (Railway)

### Create PostgreSQL Database

1. Go to [railway.app](https://railway.app)
2. Sign up / Log in with GitHub
3. Click "New Project" → "Provision PostgreSQL"
4. Configure:
   - Database name: `family_calendar`
   - Username: `postgres`
   - Password: Auto-generated (save it!)
5. Note the `DATABASE_URL` from variables

### Example DATABASE_URL
```
postgresql://postgres:password@containers.railway.app:6379/family_calendar
```

## Step 2: Backend Deployment (Railway)

### Deploy NestJS App

1. **Prepare your code**
   ```bash
   # Push to GitHub
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Create Railway project**
   - New Project → GitHub
   - Select your repository
   - Wait for auto-detection

3. **Configure Environment Variables**
   In Railway Dashboard → Variables:
   ```
   DATABASE_URL=postgresql://...
   OPENAI_API_KEY=sk-...
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=your-secret-key
   FRONTEND_URL=https://your-frontend-domain.vercel.app
   ```

4. **Add Start Script**
   Update `package.json`:
   ```json
   {
     "scripts": {
       "start:prod": "node dist/main"
     }
   }
   ```

5. **Deploy**
   - Railway auto-deploys on git push
   - Monitor build logs
   - Note the backend URL: `https://railway-app-url.up.railway.app`

6. **Run Migrations**
   In Railway Terminal:
   ```bash
   npm run db:migrate -- --skip-generate
   npm run db:seed
   ```

## Step 3: Frontend Deployment (Vercel)

### Deploy Next.js App

1. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import GitHub repository
   - Select `frontend` folder as root directory

2. **Configure Environment Variables**
   In Vercel Dashboard → Settings → Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-railway-url.up.railway.app
   NEXT_PUBLIC_FAMILY_ID=default-family
   ```

3. **Build Settings**
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

4. **Deploy**
   - Vercel auto-deploys on git push
   - Frontend URL: `https://your-project.vercel.app`

## Step 4: Custom Domain Setup

### With Vercel
1. Dashboard → Settings → Domains
2. Add your domain
3. Follow DNS configuration instructions

### With Railway (Backend)
1. Project Settings → Domains
2. Add custom domain
3. Update DNS records

## Step 5: Environment Variables Summary

### Backend (.env)
```
DATABASE_URL=postgresql://postgres:...@containers.railway.app:6379/family_calendar
OPENAI_API_KEY=sk-...
NODE_ENV=production
PORT=3001
JWT_SECRET=your-jwt-secret
FRONTEND_URL=https://your-frontend.vercel.app
```

### Frontend (.env.local / Vercel)
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_FAMILY_ID=default-family
```

## Step 6: Database Migrations

### First Time Setup
```bash
# In backend directory
npm run db:migrate
npm run db:seed
```

### Future Migrations
```bash
# Create new migration
npm run db:migrate

# Push schema changes
npm run db:push
```

### Viewing Database
```bash
npm run db:studio
# Or in Railway terminal
npx prisma studio
```

## Step 7: Monitoring & Logs

### Backend (Railway)
- Dashboard → Logs
- Real-time logging
- Error tracking

### Frontend (Vercel)
- Dashboard → Functions
- Real-time analytics
- Error reports

### Database (Railway)
- Network → Data
- Query statistics
- Performance metrics

## Step 8: Continuous Integration/Deployment

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to Railway
        uses: railwayapp/deploy-action@v1
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## Step 9: Post-Deployment Checklist

- [ ] Database migrations completed
- [ ] Backend API responding (`/health` endpoint)
- [ ] Frontend loads without errors
- [ ] API calls working (check Network tab)
- [ ] Chatbot responding to messages
- [ ] Calendar displaying events
- [ ] Environment variables set correctly
- [ ] CORS configured properly
- [ ] OpenAI API key working
- [ ] Database backups enabled

## Troubleshooting

### Backend Not Responding
- Check Railway logs
- Verify DATABASE_URL
- Ensure migrations ran
- Check CORS settings

### Frontend API Errors
- Check NEXT_PUBLIC_API_URL
- Verify backend is running
- Check browser console
- Inspect Network tab

### Database Connection Issues
- Verify DATABASE_URL format
- Check PostgreSQL credentials
- Ensure Railway PostgreSQL is running
- Test connection string

### Cold Starts
- Railway has cold start delays
- Use Railway's "Always On" feature
- Implement request retries in frontend

## Performance Optimization

### Backend
- Enable database indexing
- Add caching layer (Redis)
- Use pagination for large datasets

### Frontend
- Image optimization
- Code splitting
- React Server Components
- Static generation where possible

### Database
- Regular backups
- Index optimization
- Connection pooling

## Security Considerations

1. **Secrets Management**
   - Never commit `.env` files
   - Use environment variable managers
   - Rotate API keys regularly

2. **CORS**
   - Configure for frontend domain only
   - Use credentials: true for cookies

3. **Validation**
   - Server-side validation
   - Input sanitization
   - Rate limiting

4. **Database**
   - Use strong passwords
   - Enable SSL connections
   - Regular backups

5. **API Security**
   - Add API key authentication
   - Rate limiting
   - Request validation

## Backup & Recovery

### Database Backups
Railway automatically backs up databases. To restore:
1. Railway Dashboard → Database → Restore
2. Select backup point
3. Confirm restore

### Code Backups
- Maintain GitHub repository
- Tag releases
- Document versions

## Scaling Considerations

As your app grows:

### Upgrade Railway
- Increase vCPU/RAM
- Use dedicated PostgreSQL
- Enable auto-scaling

### Upgrade Vercel
- Pro plan for advanced features
- More serverless function invocations
- Custom domains

### Database Optimization
- Add read replicas
- Implement caching
- Database sharding

## Cost Estimation

### Monthly Costs (Approximate)
- **Railway Backend**: $5-10/month
- **Railway PostgreSQL**: $5-10/month
- **Vercel Frontend**: Free - $20/month
- **OpenAI API**: Based on usage (~$5-50/month)
- **Domain**: $10-15/year (optional)

**Total**: ~$15-50/month

## Support & Resources

- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [NestJS Docs](https://docs.nestjs.com)
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [OpenAI Docs](https://platform.openai.com/docs)

## Conclusion

Your Family Calendar + AI Assistant is now live! Monitor logs, gather user feedback, and iterate on features.
