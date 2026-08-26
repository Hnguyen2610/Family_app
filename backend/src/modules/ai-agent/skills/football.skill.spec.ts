import { FootballSkill } from './football.skill';

describe('FootballSkill', () => {
  let footballService: any;
  let skill: FootballSkill;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T03:00:00.000Z'));
    footballService = {
      getMatchesForLeague: jest.fn().mockResolvedValue([]),
      getAllFreeMatches: jest.fn().mockResolvedValue([
        { id: 1, competitionName: 'Đội tuyển Việt Nam', homeTeam: 'Việt Nam', awayTeam: 'Thái Lan' },
      ]),
    };
    skill = new FootballSkill(footballService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('executeTool fetches matches across all top leagues in a single call when no league is given', async () => {
    const result = await skill.executeTool('get_matches', {}, {
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'lich thi dau bong da hom nay',
      intent: 'general_chat',
    });

    expect(footballService.getAllFreeMatches).toHaveBeenCalledTimes(1);
    expect(footballService.getMatchesForLeague).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ homeTeam: 'Việt Nam', awayTeam: 'Thái Lan' }),
    ]));
  });

  it('executeTool still queries a single league when the user names one', async () => {
    footballService.getMatchesForLeague.mockResolvedValue([
      { id: 2, competitionName: 'Premier League', homeTeam: 'Arsenal', awayTeam: 'Chelsea' },
    ]);

    const result = await skill.executeTool('get_matches', { league: 'Premier League' }, {
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'lich thi dau ngoai hang anh hom nay',
      intent: 'general_chat',
    });

    expect(footballService.getMatchesForLeague).toHaveBeenCalledWith('PL', expect.any(String), expect.any(String));
    expect(footballService.getAllFreeMatches).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('executeTool treats a "tat ca"/"all" league argument the same as no league', async () => {
    const result = await skill.executeTool('get_matches', { league: 'tat ca' }, {
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'tat ca',
      intent: 'general_chat',
    });

    expect(footballService.getAllFreeMatches).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
