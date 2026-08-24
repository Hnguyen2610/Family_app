import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as process from 'process';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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
  const user1 = await prisma.user.upsert({
    where: { email: 'dad@family.com' },
    update: {
      name: 'Bố',
      familyId: family.id,
    },
    create: {
      email: 'dad@family.com',
      name: 'Bố',
      familyId: family.id,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'mom@family.com' },
    update: {
      name: 'Mẹ',
      familyId: family.id,
    },
    create: {
      email: 'mom@family.com',
      name: 'Mẹ',
      familyId: family.id,
    },
  });

  const user3 = await prisma.user.upsert({
    where: { email: 'child@family.com' },
    update: {
      name: 'Con',
      familyId: family.id,
    },
    create: {
      email: 'child@family.com',
      name: 'Con',
      familyId: family.id,
    },
  });

  // Create sample meals
  const findOrCreateMeal = async (name: string, tags: string[]) => {
    const existing = await prisma.meal.findFirst({ where: { name, category: 'MAIN_COURSE' } });
    if (existing) return existing;
    return prisma.meal.create({
      data: {
        name,
        category: 'MAIN_COURSE',
        tags,
      },
    });
  };

  const meal1 = await findOrCreateMeal('Phở', ['vietnamese', 'traditional']);
  const meal2 = await findOrCreateMeal('Cơm gà', ['vietnamese', 'fast']);
  const meal3 = await findOrCreateMeal('Bánh mì', ['quick', 'traditional']);
  const meal4 = await findOrCreateMeal('Bún bò', ['vietnamese', 'traditional']);

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
    skipDuplicates: true,
  });

  // Create sample events
  await prisma.event.upsert({
    where: { id: 'seed-mom-birthday-2026' },
    update: {},
    create: {
      id: 'seed-mom-birthday-2026',
      title: 'Sinh nhật Mẹ',
      description: 'Sinh nhật của mẹ',
      date: new Date('2026-05-15'),
      type: 'BIRTHDAY',
      familyId: family.id,
      createdBy: user1.id,
    },
  });

  await prisma.event.upsert({
    where: { id: 'seed-wedding-anniversary-2026' },
    update: {},
    create: {
      id: 'seed-wedding-anniversary-2026',
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
    await pool.end();
  });
