import { PrismaClient } from '@prisma/client';
import * as process from 'process';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create a family
  const family = await prisma.family.upsert({
    where: { id: 'default-family' },
    update: {},
    create: {
      id: 'default-family',
      name: 'Demo Family',
    },
  });

  // Create users
  const user1 = await prisma.user.create({
    data: {
      email: 'dad@family.com',
      name: 'Bố',
      familyId: family.id,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'mom@family.com',
      name: 'Mẹ',
      familyId: family.id,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'child@family.com',
      name: 'Con',
      familyId: family.id,
    },
  });

  // Create sample meals
  const meal1 = await prisma.meal.create({
    data: {
      name: 'Phở',
      category: 'MAIN_COURSE',
      tags: ['vietnamese', 'traditional'],
    },
  });

  const meal2 = await prisma.meal.create({
    data: {
      name: 'Cơm gà',
      category: 'MAIN_COURSE',
      tags: ['vietnamese', 'fast'],
    },
  });

  const meal3 = await prisma.meal.create({
    data: {
      name: 'Bánh mì',
      category: 'MAIN_COURSE',
      tags: ['quick', 'traditional'],
    },
  });

  const meal4 = await prisma.meal.create({
    data: {
      name: 'Bún bò',
      category: 'MAIN_COURSE',
      tags: ['vietnamese', 'traditional'],
    },
  });

  // Add preferences
  await prisma.mealPreference.createMany({
    data: [
      { userId: user1.id, mealId: meal1.id },
      { userId: user1.id, mealId: meal2.id },
      { userId: user2.id, mealId: meal1.id },
      { userId: user2.id, mealId: meal3.id },
      { userId: user3.id, mealId: meal2.id },
      { userId: user3.id, mealId: meal4.id },
    ],
  });

  // Create sample events
  await prisma.event.create({
    data: {
      title: 'Sinh nhật Mẹ',
      description: 'Sinh nhật của mẹ',
      date: new Date('2026-05-15'),
      type: 'BIRTHDAY',
      familyId: family.id,
      createdBy: user1.id,
    },
  });

  await prisma.event.create({
    data: {
      title: 'Kỷ niệm ngày cưới',
      description: '25 năm kết hôn',
      date: new Date('2026-06-20'),
      type: 'ANNIVERSARY',
      familyId: family.id,
      createdBy: user1.id,
    },
  });

  console.log('✅ Seed completed!');
  console.log(`
  Created:
  - 1 family: ${family.name}
  - 3 users: ${user1.name}, ${user2.name}, ${user3.name}
  - 4 meals with preferences
  - 2 sample events
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
