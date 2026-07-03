export type ProactiveDeliveryOptions = {
  skipTelegram?: boolean;
  skipWebPush?: boolean;
};

export function getProactiveDeliveryOptions(settings: Record<string, any>): ProactiveDeliveryOptions {
  const channels = (settings.proactiveAssistantChannels || settings.proactiveChannels || {}) as Record<string, any>;
  return {
    skipTelegram: channels.telegram === false,
    skipWebPush: channels.webpush === false,
  };
}

export function isProactiveTypeEnabled(settings: Record<string, any>, type: string) {
  const typeSettings = (settings.proactiveAssistantTypes || settings.proactiveTypes || {}) as Record<string, any>;
  return typeSettings[type] !== false;
}

export function shouldRunProactiveAtConfiguredHour(settings: Record<string, any>, now: Date) {
  const configured = String(settings.proactiveAssistantTime || settings.proactiveTime || '07:30');
  const hour = Number.parseInt(configured.split(':')[0] || '7', 10);
  if (!Number.isFinite(hour)) return now.getHours() === 7;
  return now.getHours() === Math.max(0, Math.min(23, hour));
}
