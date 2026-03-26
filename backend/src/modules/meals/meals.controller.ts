import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { MealsService } from './meals.service';
import {
  CreateMealDto,
  UpdateMealDto,
  AddMealPreferenceDto,
  RecordMealDto,
  AddCustomMealPreferenceDto,
} from './dto/meal.dto';

@Controller('api/meals')
export class MealsController {
  constructor(private readonly mealsService: MealsService) {}

  // ========== Meal Endpoints ==========

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
  addPreference(@Body() dto: AddMealPreferenceDto) {
    return this.mealsService.addPreference(dto);
  }

  @Post('preferences/custom')
  addCustomPreference(@Body() dto: AddCustomMealPreferenceDto) {
    return this.mealsService.addCustomPreference(dto);
  }

  @Get('preferences/:userId')
  getUserPreferences(@Param('userId') userId: string) {
    return this.mealsService.getUserPreferences(userId);
  }

  @Delete('preferences/:userId/:mealId')
  removePreference(
    @Param('userId') userId: string,
    @Param('mealId') mealId: string,
  ) {
    return this.mealsService.removePreference(userId, mealId);
  }

  // ========== History ==========

  @Post('history/record')
  recordMeal(
    @Query('familyId') familyId: string,
    @Body() dto: RecordMealDto,
  ) {
    return this.mealsService.recordMeal(familyId, dto);
  }

  @Get('history/recent')
  getMealHistory(
    @Query('familyId') familyId: string,
    @Query('days') days?: string,
  ) {
    return this.mealsService.getMealHistory(familyId, days ? Number.parseInt(days) : 30);
  }

  // ========== Suggestions (AI / Family Menu) ==========

  @Get('family/:familyId/generate-menu')
  generateFamilyMenu(@Param('familyId') familyId: string) {
    return this.mealsService.generateFamilyMenu(familyId);
  }
}
