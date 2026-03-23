// # Shared Types & Interfaces

// TypeScript types shared between frontend and backend.

// ## Events

```typescript
interface Event {
  id: string;
  title: string;
  description?: string;
  date: Date;
  lunarDate?: string;
  type: EventType;
  isRecurring?: boolean;
  recurring?: string;
  familyId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

enum EventType {
  BIRTHDAY = 'BIRTHDAY',
  ANNIVERSARY = 'ANNIVERSARY',
  HOLIDAY = 'HOLIDAY',
  APPOINTMENT = 'APPOINTMENT',
  TASK = 'TASK',
  GENERAL = 'GENERAL',
}
```

// ## Meals

```typescript
interface Meal {
  id: string;
  name: string;
  category: MealCategory;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

enum MealCategory {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  SNACK = 'SNACK',
}

interface MealPreference {
  id: string;
  userId: string;
  mealId: string;
  createdAt: Date;
}

interface MealHistory {
  id: string;
  mealId: string;
  date: Date;
  category: MealCategory;
  createdAt: Date;
}
```

// ## Users & Family

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  familyId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Family {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
```

// ## Chat

```typescript
interface ChatMessage {
  id: string;
  familyId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}
```

// ## API Responses

```typescript
interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  status: number;
}
```
