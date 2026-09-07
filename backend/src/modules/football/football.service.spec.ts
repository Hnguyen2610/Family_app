import { FootballService } from './football.service';

describe('FootballService', () => {
  let service: FootballService;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.FOOTBALL_DATA_API_KEY;

  beforeEach(() => {
    process.env.FOOTBALL_DATA_API_KEY = 'test-key';
    service = new FootballService();
    jest.spyOn(service as any, 'getAllVietnamFootballMatches').mockResolvedValue([]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.FOOTBALL_DATA_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  describe('getAllFreeMatches', () => {
    it('fetches each default top league individually instead of the bulk /matches endpoint', async () => {
      // football-data.org's free tier silently returns only a tiny, inconsistent subset of
      // competitions via the bulk /v4/matches endpoint (verified live: it dropped Premier
      // League/La Liga/Serie A/Bundesliga matches that DO exist and ARE returned correctly
      // by the per-competition /v4/competitions/{code}/matches endpoint). getMatchesForLeague
      // already uses that reliable per-competition endpoint — fetch each league through it.
      const getMatchesForLeagueSpy = jest.spyOn(service, 'getMatchesForLeague').mockResolvedValue([]);
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as any;

      await service.getAllFreeMatches('2026-09-06', '2026-09-06');

      expect(fetchSpy).not.toHaveBeenCalled();
      const requestedCodes = getMatchesForLeagueSpy.mock.calls.map((call) => call[0]);
      expect(requestedCodes.sort()).toEqual([...service.defaultLeagues].sort());
    });

    it('merges matches from every requested league plus Vietnam matches', async () => {
      jest.spyOn(service, 'getMatchesForLeague').mockImplementation(async (code: string) => {
        if (code === 'PL') return [{ id: 1, competitionCode: 'PL' } as any];
        if (code === 'PD') return [{ id: 2, competitionCode: 'PD' } as any];
        return [];
      });
      (service as any).getAllVietnamFootballMatches.mockResolvedValue([{ id: 3, competitionCode: 'VIETNAM' } as any]);

      const matches = await service.getAllFreeMatches('2026-09-06', '2026-09-06');

      expect(matches.map((m) => m.id).sort()).toEqual([1, 2, 3]);
    });

    it('does not let one league failing drop the others', async () => {
      jest.spyOn(service, 'getMatchesForLeague').mockImplementation(async (code: string) => {
        if (code === 'PL') throw new Error('rate limited');
        if (code === 'PD') return [{ id: 2, competitionCode: 'PD' } as any];
        return [];
      });

      const matches = await service.getAllFreeMatches('2026-09-06', '2026-09-06');

      expect(matches.map((m) => m.id)).toEqual([2]);
    });
  });

  describe('getTodayMatches', () => {
    it('fetches each default top league individually instead of the bulk /matches endpoint', async () => {
      const getMatchesForLeagueSpy = jest.spyOn(service, 'getMatchesForLeague').mockResolvedValue([]);
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as any;

      await service.getTodayMatches('2026-09-06');

      expect(fetchSpy).not.toHaveBeenCalled();
      const requestedCodes = getMatchesForLeagueSpy.mock.calls.map((call) => call[0]);
      expect(requestedCodes.sort()).toEqual([...service.defaultLeagues].sort());
    });
  });
});
