# Architecture & Design Decisions

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js Frontend (TypeScript + React 18)           │   │
│  │  - Calendar Component (Monthly View)                │   │
│  │  - Chat Component (AI Chatbot)                       │   │
│  │  - State Management (Zustand)                        │   │
│  │  - HTTP Client (Axios)                              │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HTTP/REST API
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                      API Layer                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  NestJS Backend (TypeScript)                        │   │
│  │  - Events Module (CRUD)                            │   │
│  │  - Meals Module (Smart Suggestions)                │   │
│  │  - AI Agent Module (OpenAI Integration)            │   │
│  │  - Users Module (Family Management)                │   │
│  │  - Prisma ORM                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ SQL
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                    Data Layer                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL Database                                │   │
│  │  - Users & Families                                 │   │
│  │  - Events (Solar + Lunar)                          │   │
│  │  - Meals & Preferences                             │   │
│  │  - Chat History                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Module Organization (Backend)

### Events Module
- **Responsibility**: Calendar event management
- **Models**: Event (title, date, type, lunar date)
- **Features**:
  - CRUD operations
  - Monthly filtering
  - Lunar date calculation
  - Event types support
  - Recurring events (planned)

### Meals Module
- **Responsibility**: Meal preferences and smart suggestions
- **Models**: Meal, MealPreference, MealHistory
- **Features**:
  - Smart meal suggestion (avoiding repetition)
  - Preference tracking
  - Meal history
  - Category filtering
  - User preference aggregation

### AI Agent Module
- **Responsibility**: Chatbot and OpenAI integration
- **Features**:
  - OpenAI API integration with function calling
  - Tool calling for Events, Meals, User queries
  - Chat history management
  - Multi-language support
  - Intent detection

### Users Module
- **Responsibility**: Family and user management
- **Models**: User, Family
- **Features**:
  - Multi-user family system
  - User CRUD
  - Family grouping
  - User preferences

## Frontend Architecture

### Components
- **Calendar**: Monthly view, event display, date selection
- **Chatbot**: Message interface, message history, quick commands
- **Layout**: Tab navigation, header, footer

### State Management (Zustand)
- **EventStore**: Events state
- **ChatStore**: Chat messages
- **MealStore**: Meals and suggestions

### API Layer
- **api-client.ts**: Centralized Axios instance
- **Organized endpoints**: Events, Meals, Chat, Users

## Database Schema Design

### Entities and Relationships

```
Family
  ├─ Users (1:M)
  ├─ Events (1:M)
  └─ ChatMessages (1:M)

User
  ├─ Events (created_by)
  ├─ MealPreferences (M:M through junction table)
  └─ ChatMessages (implicit, through familyId)

Meal
  ├─ MealPreferences (1:M)
  └─ MealHistory (1:M)

Event
  ├─ User (created_by)
  └─ Family
```

### Key Design Choices

1. **Soft Deletes**: Not implemented (can be added)
2. **Indexes**: Created on frequently queried fields
3. **Constraints**: Unique constraints on email, user-meal preferences
4. **Timestamps**: createdAt, updatedAt on all entities

## API Design

### RESTful Conventions
- POST: Create
- GET: Read
- PUT: Update
- DELETE: Delete

### Query Parameters
- `familyId`: Scope data to family
- `month`, `year`: Temporal filtering
- `userIds`: Multi-user operations
- `limit`: Pagination

### Response Format
```json
{
  "id": "uuid",
  "title": "Event Title",
  "data": {...},
  "timestamp": "ISO8601",
  "status": 200
}
```

## Security Design

### Authentication (Future Enhancement)
- JWT tokens
- Refresh token rotation
- Secure cookie storage

### CORS
- Configured for frontend domain
- Credentials enabled

### Input Validation
- Class validator decorators
- DTO validation on backend
- Client-side validation on frontend

### SQL Injection Protection
- Prisma ORM handles parameterized queries
- No raw SQL queries

## Performance Optimizations

### Frontend
- Code splitting with Next.js
- React memo for expensive components
- Zustand for efficient state updates
- Image optimization

### Backend
- Database indexing on foreign keys
- Select only needed fields
- Pagination for large datasets (future)
- Response caching headers

### Database
- Indexed queries
- Foreign key constraints
- Connection pooling setup ready

## Scalability Considerations

### Current Limits
- Single database instance
- In-memory state on backend
- No caching layer

### Scale-out Strategy
1. **Caching**: Add Redis for chat history
2. **Database**: Read replicas for heavy queries
3. **Backend**: Horizontal scaling with load balancer
4. **Frontend**: CDN optimization
5. **File Storage**: S3 for meal images/profiles

## Error Handling

### Backend
- HTTP status codes (200, 201, 400, 404, 500)
- Descriptive error messages
- Validation error details

### Frontend
- Try-catch in API calls
- User-friendly error messages
- Console logging for debugging

## Testing Strategy

### Unit Tests
- Service layer tests
- Utility function tests

### Integration Tests
- API endpoint tests
- Database integration

### E2E Tests
- User workflows
- Full application scenarios

## Development Workflow

### Version Control
- Feature branches
- Pull request reviews
- Commit conventions

### CI/CD
- GitHub Actions ready
- Auto-deploy on merge to main
- Build and test pipeline

## Deployment Strategy

### Environments
1. **Development**: Local
2. **Staging**: Railway (future)
3. **Production**: Vercel + Railway

### Deployment Flow
```
Code Push → GitHub
    ↓
CI Pipeline (Tests)
    ↓
Build Artifacts
    ↓
Deploy to Production
    ↓
Health Checks
```

## Monitoring & Logging

### Backend Logs
- Request/response logging
- Error stack traces
- Database query logging

### Frontend Analytics
- Error tracking
- Performance monitoring
- User session tracking

## Technology Justification

### Why NestJS?
- Enterprise-grade framework
- Dependency injection
- TypeScript support
- Modular architecture
- Good for scaling

### Why Next.js?
- Server-side rendering ready
- Built-in optimization
- File-based routing
- Great DX
- Vercel integration

### Why Zustand?
- Lightweight
- Simple API
- No boilerplate
- TypeScript friendly

### Why Prisma?
- Type-safe ORM
- Auto-migrations
- Great DX
- PostgreSQL support
- Query builder

### Why PostgreSQL?
- ACID transactions
- Reliable
- JSON support
- Scaling ready
- Great performance

## Future Enhancements

1. **Authentication**: JWT-based auth
2. **Real-time**: WebSocket support for live updates
3. **Push Notifications**: Email/SMS alerts
4. **Mobile App**: React Native version
5. **Voice**: Voice input for chatbot
6. **Images**: Meal photos
7. **Sharing**: Event invitations
8. **Analytics**: Family statistics
9. **Dark Mode**: UI theme support
10. **Caching**: Redis implementation

## Conclusion

This architecture provides a solid foundation for a production-ready family management application with room for growth and enhancement based on user feedback and requirements.
