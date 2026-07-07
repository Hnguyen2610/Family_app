import { shouldAllowSideEffectTool } from './ai-tool-policy';

describe('shouldAllowSideEffectTool', () => {
  it('allows createEvent when current message answers a previous create-event clarification', () => {
    const allowed = shouldAllowSideEffectTool('createEvent', {
      userMessage: 'thu 6 tuan nay',
      history: [
        { role: 'user', content: 'tao lich da bong toi thu 6 tuan nay scope ca nhan' },
        { role: 'assistant', content: 'Ban muon tao su kien vao ngay nao?' },
      ],
    } as any);

    expect(allowed).toBe(true);
  });
});
