import { ModuleRef } from '@nestjs/core';
import { AiSkillRegistry } from './ai-skill-registry';
import { MarketSkill } from './market.skill';
import { GeneralChatSkill } from './general-chat.skill';
import { MealSkill } from './meal.skill';
import { CalendarSkill } from './calendar.skill';
import { HoroscopeSkill } from './horoscope.skill';
import { FamilyKnowledgeSkill } from './family-knowledge.skill';
import { FootballSkill } from './football.skill';
import { WeatherSkill } from './weather.skill';
import { SearchSkill } from './search.skill';

describe('AiSkillRegistry.getAllToolOwners', () => {
  it('maps every tool name from every skill to its owning skill instance', () => {
    const stubs = {
      MarketSkill: { name: 'MarketSkill', getTools: () => [{ type: 'function', function: { name: 'getGoldPrice' } }] },
      GeneralChatSkill: { name: 'GeneralChatSkill', getTools: () => [] },
      MealSkill: { name: 'MealSkill', getTools: () => [{ type: 'function', function: { name: 'generateFamilyMenu' } }] },
      CalendarSkill: { name: 'CalendarSkill', getTools: () => [{ type: 'function', function: { name: 'createEvent' } }, { type: 'function', function: { name: 'getEventsByMonth' } }] },
      HoroscopeSkill: { name: 'HoroscopeSkill', getTools: undefined },
      FamilyKnowledgeSkill: { name: 'FamilyKnowledgeSkill', getTools: () => [{ type: 'function', function: { name: 'searchFamilyNotes' } }] },
      FootballSkill: { name: 'FootballSkill', getTools: () => [{ type: 'function', function: { name: 'get_matches' } }] },
      WeatherSkill: { name: 'WeatherSkill', getTools: () => [{ type: 'function', function: { name: 'getWeather' } }] },
      SearchSkill: { name: 'SearchSkill', getTools: () => [{ type: 'function', function: { name: 'search' } }] },
    };

    const moduleRef = { get: (token: any) => (stubs as any)[token.name] };
    const registry = new AiSkillRegistry(moduleRef as unknown as ModuleRef);
    registry.onModuleInit();

    const owners = registry.getAllToolOwners();
    expect(owners.get('createEvent')?.name).toBe('CalendarSkill');
    expect(owners.get('getEventsByMonth')?.name).toBe('CalendarSkill');
    expect(owners.get('searchFamilyNotes')?.name).toBe('FamilyKnowledgeSkill');
    expect(owners.get('get_matches')?.name).toBe('FootballSkill');
    expect(owners.size).toBe(8);
  });
});
