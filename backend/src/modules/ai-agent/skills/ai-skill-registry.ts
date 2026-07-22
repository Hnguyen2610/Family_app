import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiSkill } from '../interfaces/ai-skill.interface';
import { MarketSkill } from './market.skill';
import { GeneralChatSkill } from './general-chat.skill';
import { MealSkill } from './meal.skill';
import { CalendarSkill } from './calendar.skill';
import { HoroscopeSkill } from './horoscope.skill';
import { FamilyKnowledgeSkill } from './family-knowledge.skill';
import { FootballSkill } from './football.skill';
import { WeatherSkill } from './weather.skill';
import { SearchSkill } from './search.skill';

@Injectable()
export class AiSkillRegistry implements OnModuleInit {
  private readonly logger = new Logger(AiSkillRegistry.name);
  private skills: AiSkill[] = [];

  constructor(private moduleRef: ModuleRef) {}

  onModuleInit() {
    this.skills = [
      this.moduleRef.get(MarketSkill),
      this.moduleRef.get(MealSkill),
      this.moduleRef.get(CalendarSkill),
      this.moduleRef.get(HoroscopeSkill),
      this.moduleRef.get(FamilyKnowledgeSkill),
      this.moduleRef.get(FootballSkill),
      this.moduleRef.get(WeatherSkill),
      this.moduleRef.get(SearchSkill),
      this.moduleRef.get(GeneralChatSkill),
    ];
    this.logger.log(`Registered ${this.skills.length} AI skills`);
  }

  getAllSkills(): AiSkill[] {
    return this.skills;
  }

  getAllToolOwners(): Map<string, AiSkill> {
    const owners = new Map<string, AiSkill>();
    for (const skill of this.skills) {
      for (const tool of skill.getTools?.() || []) {
        if (tool.function?.name) owners.set(tool.function.name, skill);
      }
    }
    return owners;
  }
}
