export function getTools() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'generateFamilyMenu',
        description:
          'Generates a random, balanced family menu (Main Course, Vegetable, Soup) based on family preferences and recent history.',
        parameters: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'getGoldPrice',
        description:
          'Fetch real-time gold prices in Vietnam (SJC, XAUUSD) in VND and USD. MUST be called when user asks about gold price, gia vang, or precious metal prices.',
        parameters: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'getEventsByMonth',
        description: 'Get all events for a specific month. Calls this to check the calendar.',
        parameters: {
          type: 'object' as const,
          properties: {
            familyId: {
              type: 'string',
              description: 'Family ID. Use "all" to search for events across all families the user belongs to.',
            },
            month: {
              type: 'number',
              description: 'Month (1-12)',
            },
            year: {
              type: 'number',
              description: 'Year',
            },
            userId: {
              type: 'string',
              description: 'User ID of the requester to see their private events (optional)',
            },
          },
          required: ['familyId', 'month', 'year'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'createEvent',
        description:
          'Create a new event in the family calendar. Use ONLY when the user explicitly asks to create, add, or schedule an event. NEVER use this tool automatically if the user just asks for information or a reading.',
        parameters: {
          type: 'object' as const,
          properties: {
            title: {
              type: 'string',
              description: 'Event title',
            },
            description: {
              type: 'string',
              description: 'Event description',
            },
            date: {
              type: 'string',
              description: 'Event date in YYYY-MM-DD format',
            },
            time: {
              type: 'string',
              description: 'Event time in HH:mm format (24h), e.g., "18:00"',
            },
            scope: {
              type: 'string',
              enum: ['PRIVATE', 'FAMILY', 'GLOBAL'],
              description:
                'Scope/Privacy of the event. Use PRIVATE for personal tasks, FAMILY for family events.',
            },
            isRecurring: {
              type: 'boolean',
              description: 'Whether the event is recurring',
            },
            recurring: {
              type: 'string',
              enum: ['NONE', 'WEEKLY', 'MONTHLY', 'YEARLY'],
              description:
                'Recurrence frequency. Use MONTHLY/YEARLY with useLunar for traditional events.',
            },
            familyId: {
              type: 'string',
              description: 'Family ID to create the event in. If not provided, it will use the current active family.',
            },
            useLunar: {
              type: 'boolean',
              description:
                'Whether to use Vietnamese Lunar calendar for recurrence (MONTHLY/YEARLY only).',
            },
          },
          required: ['title', 'date'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'updateEvent',
        description:
          'Update an existing event. Use this to change title, date, or description of an event.',
        parameters: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'Event ID' },
            familyId: { type: 'string', description: 'Family ID' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            date: { type: 'string', description: 'New date in YYYY-MM-DD format' },
            type: {
              type: 'string',
              enum: ['BIRTHDAY', 'ANNIVERSARY', 'HOLIDAY', 'APPOINTMENT', 'TASK', 'GENERAL'],
              description: 'New type',
            },
            isRecurring: { type: 'boolean' },
            recurring: { type: 'string', enum: ['NONE', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
            useLunar: { type: 'boolean' },
          },
          required: ['id', 'familyId'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'deleteEvent',
        description: 'Delete an event from the calendar.',
        parameters: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'Event ID' },
            familyId: { type: 'string', description: 'Family ID' },
          },
          required: ['id', 'familyId'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'getSolarDateFromLunar',
        description:
          'Convert a lunar date (day/month) to a solar date for a specific year. Use this when the user asks for a lunar date, like "9 thang 3 am".',
        parameters: {
          type: 'object' as const,
          properties: {
            day: { type: 'number', description: 'Lunar day' },
            month: { type: 'number', description: 'Lunar month' },
            year: { type: 'number', description: 'Target year' },
          },
          required: ['day', 'month', 'year'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'updateAiMemory',
        description: 'Suggest saving a new preference or note about the user or family to the AI memory. Use this when the user mentions something personal like "I love sushi", "I am allergic to peanuts", or "My son name is Bob". This tool DOES NOT save immediately, it triggers a confirmation request to the user.',
        parameters: {
          type: 'object' as const,
          properties: {
            type: {
              type: 'string',
              enum: ['foodLikes', 'foodDislikes', 'healthRestrictions', 'familyNotes'],
              description: 'Category of the memory',
            },
            value: {
              type: 'string',
              description: 'The simplified content to remember (e.g., "Phở bò" instead of "Tôi rất thích ăn phở bò")',
            },
          },
          required: ['type', 'value'],
        },
      },
    },
  ];
}


export function getGeminiTools() {
  const tools = getTools();
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as any,
      })),
    },
  ];
}

export function shouldUseTools(userMessage: string): boolean {
  return true;
}
