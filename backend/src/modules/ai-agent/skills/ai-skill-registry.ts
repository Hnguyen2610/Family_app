import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiSkill } from '../interfaces/ai-skill.interface';
import { AiIntent } from '../ai-intent-router';
import { MarketSkill } from './market.skill';
import { GeneralChatSkill } from './general-chat.skill';
import { MealSkill } from './meal.skill';
import { CalendarSkill } from './calendar.skill';
import { HoroscopeSkill } from './horoscope.skill';
import { FamilyKnowledgeSkill } from './family-knowledge.skill';

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
      this.moduleRef.get(GeneralChatSkill),
    ];
    this.logger.log(`Registered ${this.skills.length} AI skills`);
  }

  getSkillForIntent(intent: AiIntent): AiSkill {
    const skill = this.skills.find(s => s.canHandle(intent) && s.name !== 'GeneralChatSkill');
    
    if (skill) {
      return skill;
    }

    const fallback = this.skills.find(s => s.name === 'GeneralChatSkill');
    if (!fallback) {
      throw new Error('No GeneralChatSkill found in registry');
    }
    return fallback;
  }

  getAllSkills(): AiSkill[] {
    return this.skills;
  }
}
