# Family Calendar + AI Assistant

A production-ready full-stack application for family event management, meal planning, and AI-powered chatbot assistance.

## 🎯 Features

### 📅 Calendar Management

- Monthly solar and lunar calendar views
- Event CRUD operations
- Event types: Birthday, Anniversary, Holiday, Appointment, Task
- Recurring event support
- Today highlight indicator

### 🍽️ Smart Meal System

- Intelligent meal suggestions avoiding repetition
- Family member meal preferences
- Meal history tracking
- Categories: Breakfast, Lunch, Dinner, Snack
- Custom meal tags

### 🤖 AI Chatbot

- OpenAI-powered conversations
- Tool calling for smart suggestions
- Chat history management
- Multi-language support (Vietnamese/English)
- Quick command buttons

### 👨‍👩‍👧‍👦 Family Management

- Multi-user family system
- User preferences tracking
- Family-scoped data

## 🛠️ Tech Stack

### Frontend

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State**: Zustand
- **HTTP**: Axios
- **Icons**: React Icons

### Backend

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **AI**: OpenAI API
- **Validation**: class-validator

### Deployment

- **Frontend**: Vercel
- **Backend**: Railway
- **Database**: Railway PostgreSQL

## 📁 Project Structure

```
family-calendar/
├── backend/                    # NestJS backend
│   ├── src/
│   │   ├── modules/
│   │   │   ├── events/         # Event management
│   │   │   ├── meals/          # Meal system
│   │   │   ├── ai-agent/       # AI chatbot
│   │   │   └── users/          # User management
│   │   ├── prisma/             # Database service
│   │   ├── utils/              # Utilities
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── seed.ts             # Seed data
│   ├── package.json
│   └── README.md
│
├── frontend/                   # Next.js frontend
│   ├── src/
│   │   ├── app/                # Next.js app
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities
│   │   ├── stores/             # Zustand stores
│   │   └── utils/              # Helper functions
│   ├── public/                 # Static assets
│   ├── package.json
│   └── README.md
│
├── shared/                     # Shared types
│   └── types.ts
│
└── DEPLOYMENT.md              # Deployment guide
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- OpenAI API Key

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and OpenAI credentials

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Start development
npm run start:dev
```

Backend runs on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Update NEXT_PUBLIC_API_URL if backend is on different URL

# Start development
npm run dev
```

Frontend runs on `http://localhost:3000`

## 📚 API Documentation

### Events

```
POST   /api/events              Create event
GET    /api/events              List events
GET    /api/events/:id          Get event details
PUT    /api/events/:id          Update event
DELETE /api/events/:id          Delete event
GET    /api/events/month/:month Get monthly events
```

### Meals

```
POST   /api/meals                      Create meal
GET    /api/meals                      List meals
POST   /api/meals/suggestions          Get suggestions
GET    /api/meals/suggestions/lunch    Suggest lunch
GET    /api/meals/suggestions/dinner   Suggest dinner
POST   /api/meals/preferences/add      Add preference
GET    /api/meals/preferences/:userId  Get preferences
```

### Chat

```
POST   /api/chat/message              Send message
GET    /api/chat/history              Get chat history
DELETE /api/chat/history/:familyId    Clear history
```

### Users

```
POST   /api/users                     Create user
GET    /api/users/family/:familyId    List family members
GET    /api/users/:id                 Get user details
PUT    /api/users/:id                 Update user
DELETE /api/users/:id                 Delete user
```

## 🤖 AI Agent Capabilities

The chatbot automatically detects intents and calls the appropriate tools:

| Intent          | Example                        | Action               |
| --------------- | ------------------------------ | -------------------- |
| Meal Suggestion | "Hôm nay ăn gì?"               | `suggestMeal()`      |
| Gold Price      | "Giá vàng hôm nay"             | `getGoldPrice()`     |
| Event Query     | "Tháng này có gì?"             | `getEventsByMonth()` |
| Event Creation  | "Thêm sinh nhật mẹ ngày 20/10" | `createEvent()`      |

## 🗄️ Database Schema

### Core Tables

- **User**: Family members
- **Family**: Family groups
- **Event**: Calendar events
- **Meal**: Available meals
- **MealPreference**: User meal preferences
- **MealHistory**: Meal consumption history
- **ChatMessage**: AI conversation

See `backend/prisma/schema.prisma` for complete schema.

## 📦 Docker Deployment

Both backend and frontend can be containerized:

```bash
# Backend
docker build -t family-calendar-backend ./backend
docker run -p 3001:3001 --env-file backend/.env family-calendar-backend

# Frontend
docker build -t family-calendar-frontend ./frontend
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://backend:3001 \
  family-calendar-frontend
```

## 🚀 Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive deployment guide covering:

- Railway PostgreSQL setup
- NestJS deployment to Railway
- Next.js deployment to Vercel
- Environment configuration
- Custom domains
- Monitoring and scaling

## 🔒 Environment Variables

### Backend

```
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secret
FRONTEND_URL=http://localhost:3000
```

### Frontend

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_FAMILY_ID=default-family
```

## 🧪 Testing

### Backend

```bash
cd backend
npm run test              # Run tests
npm run test:watch      # Watch mode
npm run test:cov        # Coverage
```

### Frontend

Create and run tests with Jest and React Testing Library.

## 📈 Performance

- **Backend**: Auto-indexing on key fields
- **Frontend**: Image optimization, code splitting
- **Database**: Connection pooling, query optimization
- **Caching**: Browser caching, response headers

## 🔐 Security

- Input validation on both client and server
- CORS configuration
- SQL injection protection (Prisma)
- XSS prevention
- Environment variable management
- Secure password practices

## 🐛 Troubleshooting

### Common Issues

**Port already in use**

```bash
# Kill process on port 3001/3000
lsof -ti:3001 | xargs kill -9
```

**Database connection failed**

- Verify DATABASE_URL
- Check PostgreSQL is running
- Ensure credentials are correct

**API calls failing**

- Check NEXT_PUBLIC_API_URL
- Verify backend is running
- Check CORS settings

**OpenAI errors**

- Verify API key is correct
- Check account has credits
- Ensure API key is not expired

## 📚 Documentation

- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [NestJS Docs](https://docs.nestjs.com)
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- Enhanced UI/UX
- Additional AI agents
- Mobile app (React Native)
- Email notifications
- Voice input
- Dark mode
- Internationalization

## 📄 License

MIT License - feel free to use this for personal or commercial projects.

## 🎉 Next Steps

1. Clone and setup locally
2. Customize for your family
3. Deploy to production
4. Gather family feedback
5. Add new features as needed

Enjoy building your family's digital hub! 👨‍👩‍👧‍👦
