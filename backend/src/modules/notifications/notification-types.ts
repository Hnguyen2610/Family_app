export type ProactiveAssistantSummary = {
  usersScanned: number;
  dailyBriefings: number;
  eventSuggestions: number;
  financeSuggestions: number;
  weatherSuggestions: number;
  familyNoteSuggestions: number;
  skippedDuplicates: number;
  errors: number;
};

export type ProactiveRunOptions = {
  respectUserTime?: boolean;
};

export type ProactiveBriefingItem = {
  kind: 'event' | 'weather' | 'finance' | 'family_note';
  title: string;
  message: string;
  path: string;
  reason: string;
  metadata?: Record<string, any>;
};

export type NotificationPayload = {
  type: string;
  title: string;
  message: string;
  metadata?: any;
  /** Extra line appended only to the Telegram delivery, not shown in-app or via web push. */
  telegramExtra?: string;
};

export type CreateNotificationOptions = {
  skipTelegram?: boolean;
  skipWebPush?: boolean;
};

export function cleanHtmlForTelegram(html: string): string {
  return html
    .replace(/<p>/g, '')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .trim();
}

export { isValidEmail } from '../../utils/validation.util';
