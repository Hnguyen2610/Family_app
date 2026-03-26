import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/families')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  async create(@Body('name') name: string) {
    return this.familiesService.create(name);
  }

  @Get()
  @Roles('SUPER_ADMIN')
  async findAll() {
    return this.familiesService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN')
  async findOne(@Param('id') id: string) {
    return this.familiesService.findById(id);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN')
  async update(@Param('id') id: string, @Body('name') name: string) {
    return this.familiesService.update(id, name);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  async remove(@Param('id') id: string) {
    return this.familiesService.delete(id);
  }
}
