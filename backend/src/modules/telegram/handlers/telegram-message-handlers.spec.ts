import { stripBotMention } from './telegram-message-handlers';

describe('stripBotMention', () => {
  it('returns the remaining text when the message starts with an @mention of the bot', () => {
    expect(stripBotMention('@family_ai_bot tao lich hop luc 9h', 'family_ai_bot')).toBe('tao lich hop luc 9h');
  });

  it('returns undefined when the message does not mention the bot', () => {
    expect(stripBotMention('hom nay an gi nhi', 'family_ai_bot')).toBeUndefined();
  });

  it('returns undefined when botUsername is not known yet', () => {
    expect(stripBotMention('@family_ai_bot xin chao', undefined)).toBeUndefined();
  });

  it('is case-insensitive on the username', () => {
    expect(stripBotMention('@Family_AI_Bot xin chao', 'family_ai_bot')).toBe('xin chao');
  });
});
