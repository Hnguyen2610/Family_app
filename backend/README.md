# Family Calendar + AI Assistant - Backend

Production-ready NestJS backend for the Family Calendar + AI Assistant application.

## 🚀 Features

- **Events Management**: CRUD operations for family events with lunar calendar support
- **Meal Preference System**: Smart meal suggestions avoiding repetition
- **AI Chatbot**: OpenAI-powered chatbot with tool calling for events, meals, and gold prices
- **User Management**: Multi-user family system
- **Database**: PostgreSQL with Prisma ORM
- **API**: RESTful API with comprehensive error handling

## 📁 Project Structure

```
backend/
├── src/
│   ├── modules/
│   │   ├── events/         # Event management module
│   │   ├── meals/          # Meal preference & suggestion module
│   │   ├── ai-agent/       # OpenAI chatbot integration
│   │   └── users/          # User management module
│   ├── prisma/             # Prisma service
│   ├── utils/              # Utility functions
│   ├── app.module.ts       # Root module
│   └── main.ts             # Application entry point
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Database seeding
├── .env.example            # Environment variables template
├── tsconfig.json           # TypeScript configuration
└── package.json            # Project dependencies
```

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- OpenAI API Key

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your database and OpenAI credentials:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/family_calendar
   OPENAI_API_KEY=sk-...
   PORT=3001
   FRONTEND_URL=http://localhost:3000
   ```

3. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

4. **Seed the database (optional)**
   ```bash
   npm run db:seed
   ```

## 🏃 Running the Application

### Development
```bash
npm run start:dev
```

### Production Build
```bash
npm run build
npm run start:prod
```

### Database Management
```bash
# Open Prisma Studio
npm run db:studio

# Push schema to database
npm run db:push

# Create new migration
npm run db:migrate
```

## 📚 API Endpoints

### Events
- `POST /api/events` - Create event
- `GET /api/events` - List events (supports month/year filtering)
- `GET /api/events/:id` - Get event details
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Meals
- `POST /api/meals` - Create meal
- `GET /api/meals` - List all meals
- `POST /api/meals/suggestions` - Get meal suggestions
- `GET /api/meals/suggestions/lunch` - Suggest lunch
- `GET /api/meals/suggestions/dinner` - Suggest dinner
- `GET /api/meals/suggestions/breakfast` - Suggest breakfast

### Chat
- `POST /api/chat/message` - Send message to AI
- `GET /api/chat/history` - Get chat history
- `DELETE /api/chat/history/:familyId` - Clear chat history

### Users
- `POST /api/users` - Create user
- `GET /api/users/family/:familyId` - List family members
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## 🤖 AI Agent Capabilities

The AI chatbot supports the following intents:
- **Meal Suggestions**: "Hôm nay ăn gì?" (What to eat today?)
- **Gold Prices**: "Giá vàng hôm nay" (Gold price today?)
- **Event Queries**: "Tháng này có gì?" (What events this month?)
- **Event Creation**: "Thêm sinh nhật mẹ ngày 20/10" (Add mom's birthday on 20th October)

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

## 🐳 Docker Deployment

Create a `Dockerfile` for containerization:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "run", "start:prod"]
```

Build and run:
```bash
docker build -t family-calendar-backend .
docker run -p 3001:3000 --env-file .env family-calendar-backend
```

## 📦 Deployment to Railway

1. Connect GitHub repository to Railway
2. Add environment variables in Railway dashboard:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `NODE_ENV=production`
3. Deploy

## 📝 License

MIT
