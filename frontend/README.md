# Family Calendar + AI Assistant - Frontend

Production-ready Next.js frontend for the Family Calendar + AI Assistant application.

## 🚀 Features

- **Monthly Calendar**: View events with solar and lunar dates
- **Event Management**: Display and manage family events
- **AI Chatbot**: Chat interface with OpenAI integration
- **Meal Suggestions**: Quick actions for meal recommendations
- **Responsive Design**: Mobile-friendly UI with TailwindCSS
- **State Management**: Zustand for efficient state management

## 📁 Project Structure

```
frontend/
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Home page
│   ├── components/         # React components
│   │   ├── Calendar.tsx    # Calendar component
│   │   └── Chatbot.tsx     # Chat component
│   ├── lib/
│   │   └── api-client.ts   # Axios API client
│   ├── stores/
│   │   └── store.ts        # Zustand stores
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Utility functions
│   └── globals.css         # Global styles
├── public/                 # Static assets
├── .env.example            # Environment variables template
├── tsconfig.json           # TypeScript config
├── tailwind.config.ts      # Tailwind config
├── next.config.ts          # Next.js config
└── package.json            # Dependencies
```

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- Backend API running on `http://localhost:3001`

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Update `.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_FAMILY_ID=default-family
   ```

## 🏃 Running the Application

### Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm start
```

### Type Checking
```bash
npm run type-check
```

### Formatting
```bash
npm run format
```

## 🎨 Components

### Calendar Component
- Monthly view with navigation
- Displays solar and lunar dates
- Highlights today's date in red
- Shows events on each day
- Click to see full event details

### Chatbot Component
- Chat interface with message history
- Quick command buttons
- Real-time message updates
- Typing indicator animation

## 🔌 API Integration

All API calls are managed through `src/lib/api-client.ts`:

- **Events**: CRUD operations, monthly filtering
- **Meals**: Suggestions, preferences, history
- **Chat**: Message sending, history retrieval
- **Users**: Family member management

## 🚀 Deployment to Vercel

### Method 1: GitHub Integration
1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL
   - `NEXT_PUBLIC_FAMILY_ID`: Default family ID
4. Deploy

### Method 2: CLI Deployment
```bash
npm install -g vercel
vercel
```

### Method 3: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t family-calendar-frontend .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://your-backend-api.com \
  -e NEXT_PUBLIC_FAMILY_ID=family-id \
  family-calendar-frontend
```

## 📦 Dependencies

### Core
- **next**: React framework with SSR/SSG
- **react**: UI library
- **typescript**: Type safety

### Styling
- **tailwindcss**: Utility-first CSS
- **postcss**: CSS processing

### State Management
- **zustand**: Lightweight state management

### HTTP
- **axios**: Promise-based HTTP client
- **react-icons**: Icon library

### Utilities
- **date-fns**: Date manipulation
- **clsx**: Class name utilities

## 🔒 Environment Variables

```
NEXT_PUBLIC_API_URL=          # Backend API URL
NEXT_PUBLIC_FAMILY_ID=        # Default family ID for demo
```

## 🧪 Testing

For testing, you can use tools like:
- **Jest**: Unit testing
- **React Testing Library**: Component testing
- **Cypress**: E2E testing

## 🎯 Best Practices

- **Components**: Keep components small and focused
- **Hooks**: Use custom hooks for reusable logic
- **API**: Centralized API client for consistency
- **Store**: Use Zustand for global state
- **Styles**: Use Tailwind classes for styling

## 📝 License

MIT
