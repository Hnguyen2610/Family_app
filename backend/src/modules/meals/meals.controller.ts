import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MealsService } from './meals.service';
import {
  CreateMealDto,
  UpdateMealDto,
  AddMealPreferenceDto,
  RecordMealDto,
  AddCustomMealPreferenceDto,
} from './dto/meal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { assertFamilyMembership, assertSameFamily } from '../auth/family-access.util';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/meals')
@UseGuards(JwtAuthGuard)
export class MealsController {
  constructor(
    private readonly mealsService: MealsService,
    private readonly prisma: PrismaService,
  ) {}

  // ========== Meal Endpoints (shared catalog, no family scoping) ==========

  @Post()
  createMeal(@Body() dto: CreateMealDto) {
    return this.mealsService.createMeal(dto);
  }

  @Get()
  getAllMeals() {
    return this.mealsService.getAllMeals();
  }

  @Get(':id')
  getMealById(@Param('id') id: string) {
    return this.mealsService.getMealById(id);
  }

  @Put(':id')
  updateMeal(@Param('id') id: string, @Body() dto: UpdateMealDto) {
    return this.mealsService.updateMeal(id, dto);
  }

  @Delete(':id')
  deleteMeal(@Param('id') id: string) {
    return this.mealsService.deleteMeal(id);
  }

  // ========== Preferences ==========

  @Post('preferences/add')
  async addPreference(@Request() req: any, @Body() dto: AddMealPreferenceDto) {
    await assertSameFamily(this.prisma, req.user.id, dto.userId);
    return this.mealsService.addPreference(dto);
  }

  @Post('preferences/custom')
  async addCustomPreference(@Request() req: any, @Body() dto: AddCustomMealPreferenceDto) {
    await assertSameFamily(this.prisma, req.user.id, dto.userId);
    return this.mealsService.addCustomPreference(dto);
  }

  @Get('preferences/:userId')
  async getUserPreferences(@Request() req: any, @Param('userId') userId: string) {
    await assertSameFamily(this.prisma, req.user.id, userId);
    return this.mealsService.getUserPreferences(userId);
  }

  @Delete('preferences/:userId/:mealId')
  async removePreference(
    @Request() req: any,
    @Param('userId') userId: string,
    @Param('mealId') mealId: string,
  ) {
    await assertSameFamily(this.prisma, req.user.id, userId);
    return this.mealsService.removePreference(userId, mealId);
  }

  // ========== History ==========

  @Post('history/record')
  async recordMeal(
    @Request() req: any,
    @Query('familyId') familyId: string,
    @Body() dto: RecordMealDto,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.mealsService.recordMeal(familyId, dto);
  }

  @Get('history/recent')
  async getMealHistory(
    @Request() req: any,
    @Query('familyId') familyId: string,
    @Query('userId') userId?: string,
    @Query('days') days?: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.mealsService.getMealHistory(familyId, days ? Number.parseInt(days) : 30, userId);
  }

  // ========== Suggestions (AI / Family Menu) ==========

  @Get('family/:familyId/generate-menu')
  async generateFamilyMenu(
    @Request() req: any,
    @Param('familyId') familyId: string,
    @Query('userId') userId?: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.mealsService.generateFamilyMenu(familyId, userId);
  }
}
