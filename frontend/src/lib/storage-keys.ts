// localStorage keys — auth state, shared between api-client.ts and useAuth.tsx.
export const ACCESS_TOKEN_KEY = 'family_token';
export const REFRESH_TOKEN_KEY = 'family_refresh_token';
export const FAMILY_USER_KEY = 'family_user';
export const FAMILY_ID_KEY = 'family_id';

// sessionStorage key — a prompt queued by the dashboard quick-ask, a notification, or a daily
// summary modal, consumed by Chatbot.tsx on next mount to auto-send into a fresh session.
export const PENDING_CHAT_PROMPT_KEY = 'pending_chat_prompt';
