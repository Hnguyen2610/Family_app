import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateMealDto,
  UpdateMealDto,
  AddMealPreferenceDto,
  RecordMealDto,
  AddCustomMealPreferenceDto,
} from './dto/meal.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ========== Meal CRUD ==========

  async createMeal(dto: CreateMealDto) {
    return this.prisma.meal.create({
      data: dto,
    });
  }

  async getAllMeals() {
    return this.prisma.meal.findMany({
      include: {
        preferences: true,
      },
    });
  }

  async getMealById(id: string) {
    return this.prisma.meal.findUnique({
      where: { id },
      include: {
        preferences: true,
        history: true,
      },
    });
  }

  async updateMeal(id: string, dto: UpdateMealDto) {
    return this.prisma.meal.update({
      where: { id },
      data: dto,
    });
  }

  async deleteMeal(id: string) {
    return this.prisma.meal.delete({
      where: { id },
    });
  }

  // ========== Preferences ==========

  async addPreference(dto: AddMealPreferenceDto) {
    return this.prisma.mealPreference.create({
      data: dto,
    });
  }

  async getUserPreferences(userId: string) {
    return this.prisma.mealPreference.findMany({
      where: { userId },
      include: { meal: true },
    });
  }

  async removePreference(userId: string, mealId: string) {
    return this.prisma.mealPreference.deleteMany({
      where: { userId, mealId },
    });
  }

  // ========== Meal History ==========

  async recordMeal(familyId: string, dto: RecordMealDto) {
    const mealHistory = await this.prisma.mealHistory.create({
      data: {
        mealId: dto.mealId,
        category: dto.category,
        familyId,
        date: new Date(),
      },
      include: { meal: true },
    });

    // Notify family members
    try {
      const familyMembers = await this.prisma.user.findMany({
        where: { familyId },
        select: { id: true },
      });

      for (const member of familyMembers) {
        await this.notificationsService.createNotification(member.id, {
          type: 'MEAL_ADDED',
          title: 'Thực đơn hôm nay',
          message: `Món mới đã được cập nhật: ${mealHistory.meal.name}`,
          metadata: { mealId: mealHistory.mealId, path: '/meals' },
        });
      }
    } catch (e) {
      console.error('Failed to send meal notification', e);
    }

    return mealHistory;
  }

  async getMealHistory(familyId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.prisma.mealHistory.findMany({
      where: {
        familyId,
        date: {
          gte: startDate,
        },
      },
      include: { meal: true },
      orderBy: { date: 'desc' },
    });
  }

  async addCustomPreference(dto: AddCustomMealPreferenceDto) {
    // 1. Find or create the meal
    let meal = await this.prisma.meal.findFirst({
      where: {
        name: { equals: dto.mealName, mode: 'insensitive' },
        category: dto.category,
      },
    });

    if (!meal) {
      meal = await this.prisma.meal.create({
        data: {
          name: dto.mealName,
          category: dto.category,
        },
      });
    }

    // 2. Add preference if not exists
    const existingPref = await this.prisma.mealPreference.findUnique({
      where: {
        userId_mealId: {
          userId: dto.userId,
          mealId: meal.id,
        },
      },
    });

    if (existingPref) {
      return existingPref;
    }

    return this.prisma.mealPreference.create({
      data: {
        userId: dto.userId,
        mealId: meal.id,
      },
      include: {
        meal: true,
      },
    });
  }

  // ========== Smart Menu Generation ==========

  async generateFamilyMenu(familyId: string) {
    // 1. Get all users in the family
    const users = await this.prisma.user.findMany({
      where: { familyId },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    // 2. Get all distinct meal preferences for these users
    const preferences = await this.prisma.mealPreference.findMany({
      where: { userId: { in: userIds } },
      include: { meal: true },
    });

    // 3. Bucket into categories
    const mainCourses = new Map<string, any>();
    const vegetables = new Map<string, any>();
    const soups = new Map<string, any>();

    preferences.forEach((pref) => {
      const meal = pref.meal;
      if (meal.category === 'MAIN_COURSE') mainCourses.set(meal.id, meal);
      if (meal.category === 'VEGETABLE') vegetables.set(meal.id, meal);
      if (meal.category === 'SOUP') soups.set(meal.id, meal);
    });

    // 4. Get recent history (last 3 days) to avoid exact repetition
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recentMeals = await this.prisma.mealHistory.findMany({
      where: {
        familyId,
        date: { gte: threeDaysAgo },
      },
      select: { mealId: true },
    });
    const recentMealIds = new Set(recentMeals.map((m) => m.mealId));

    // Helper function to pick random from bucket
    const pickRandom = (bucket: Map<string, any>) => {
      const allItems = Array.from(bucket.values());
      if (allItems.length === 0) return null;

      // Try playing fair: exclude recently eaten
      const freshItems = allItems.filter((i) => !recentMealIds.has(i.id));

      // If we've eaten everything recently, fallback to allowing repeats
      const pool = freshItems.length > 0 ? freshItems : allItems;

      const randomIndex = Math.floor(Math.random() * pool.length);
      return pool[randomIndex];
    };

    const selectedMain = pickRandom(mainCourses);
    const selectedVegetable = pickRandom(vegetables);
    const selectedSoup = pickRandom(soups);

    const combo = [];
    if (selectedMain) combo.push(selectedMain);
    if (selectedVegetable) combo.push(selectedVegetable);
    if (selectedSoup) combo.push(selectedSoup);

    // 5. Optionally, we record this immediately to history so the next prompt doesn't get the exact same.
    // If you only want to suggest and not lock in, comment this out. But user requested:
    // "Khi prompt hỏi AI xem hôm nay ăn gì, AI sẽ random các món từ trong db để hoàn thiện 1 bữa ăn..."
    for (const meal of combo) {
      await this.recordMeal(familyId, {
        mealId: meal.id,
        category: meal.category,
      });
    }

    return {
      mainCourse: selectedMain || null,
      vegetable: selectedVegetable || null,
      soup: selectedSoup || null,
      details: combo,
    };
  }
}

