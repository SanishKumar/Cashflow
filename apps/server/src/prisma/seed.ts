// ──────────────────────────────────────────────
// Database Seed — Demo Data
// ──────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[SEED] Cleaning existing data...");
  await prisma.debtShare.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  console.log("[SEED] Creating users...");
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: "Alex Chen",
        email: "alex.chen@example.com",
      },
    }),
    prisma.user.create({
      data: {
        name: "Sarah Kim",
        email: "sarah.kim@example.com",
      },
    }),
    prisma.user.create({
      data: {
        name: "Mike Johnson",
        email: "mike.johnson@example.com",
      },
    }),
    prisma.user.create({
      data: {
        name: "Emily Davis",
        email: "emily.davis@example.com",
      },
    }),
    prisma.user.create({
      data: {
        name: "Chris Lee",
        email: "chris.lee@example.com",
      },
    }),
  ]);

  const [alex, sarah, mike, emily, chris] = users;
  console.log(`[SEED] Created ${users.length} users.`);

  console.log("[SEED] Creating groups...");
  const engineeringGroup = await prisma.group.create({
    data: {
      name: "Engineering Team",
      description: "Shared expenses for the engineering team",
      members: {
        create: users.map((u) => ({ userId: u.id })),
      },
    },
  });

  const tripGroup = await prisma.group.create({
    data: {
      name: "SF Weekend Trip",
      description: "Weekend getaway expenses",
      members: {
        create: [alex, sarah, mike].map((u) => ({ userId: u.id })),
      },
    },
  });

  console.log("[SEED] Created 2 groups.");

  console.log("[SEED] Creating transactions...");

  // Engineering Team transactions
  // 1. Alex paid for AWS hosting — split equally among all 5
  const awsAmount = 4250;
  await prisma.transaction.create({
    data: {
      groupId: engineeringGroup.id,
      paidById: alex.id,
      amount: awsAmount,
      description: "AWS Hosting Bill - Q3",
      debtShares: {
        create: users.map((u) => ({
          owedById: u.id,
          amount: awsAmount / users.length,
        })),
      },
    },
  });

  // 2. Sarah paid for team lunch — split equally among all 5
  const lunchAmount = 340.5;
  await prisma.transaction.create({
    data: {
      groupId: engineeringGroup.id,
      paidById: sarah.id,
      amount: lunchAmount,
      description: "Team Lunch - SF Office",
      debtShares: {
        create: users.map((u) => ({
          owedById: u.id,
          amount: lunchAmount / users.length,
        })),
      },
    },
  });

  // 3. Alex paid for GitHub licenses — split equally
  const githubAmount = 1200;
  await prisma.transaction.create({
    data: {
      groupId: engineeringGroup.id,
      paidById: alex.id,
      amount: githubAmount,
      description: "GitHub Enterprise Licenses",
      debtShares: {
        create: users.map((u) => ({
          owedById: u.id,
          amount: githubAmount / users.length,
        })),
      },
    },
  });

  // 4. Mike paid for office supplies
  const suppliesAmount = 85;
  await prisma.transaction.create({
    data: {
      groupId: engineeringGroup.id,
      paidById: mike.id,
      amount: suppliesAmount,
      description: "Office Supplies Restock",
      debtShares: {
        create: users.map((u) => ({
          owedById: u.id,
          amount: suppliesAmount / users.length,
        })),
      },
    },
  });

  // 5. Emily paid for conference tickets — split among alex, emily, chris
  const confAmount = 900;
  const confMembers = [alex, emily, chris];
  await prisma.transaction.create({
    data: {
      groupId: engineeringGroup.id,
      paidById: emily.id,
      amount: confAmount,
      description: "Tech Conference Tickets",
      debtShares: {
        create: confMembers.map((u) => ({
          owedById: u.id,
          amount: confAmount / confMembers.length,
        })),
      },
    },
  });

  // Trip Group transactions
  // 1. Alex paid for hotel
  const hotelAmount = 600;
  const tripMembers = [alex, sarah, mike];
  await prisma.transaction.create({
    data: {
      groupId: tripGroup.id,
      paidById: alex.id,
      amount: hotelAmount,
      description: "Hotel - 2 Nights",
      debtShares: {
        create: tripMembers.map((u) => ({
          owedById: u.id,
          amount: hotelAmount / tripMembers.length,
        })),
      },
    },
  });

  // 2. Mike paid for dinner
  const dinnerAmount = 180;
  await prisma.transaction.create({
    data: {
      groupId: tripGroup.id,
      paidById: mike.id,
      amount: dinnerAmount,
      description: "Group Dinner - Fisherman's Wharf",
      debtShares: {
        create: tripMembers.map((u) => ({
          owedById: u.id,
          amount: dinnerAmount / tripMembers.length,
        })),
      },
    },
  });

  console.log("[SEED] Created 7 transactions with debt shares.");
  console.log("[SEED] ✓ Seeding complete!");
}

main()
  .catch((e) => {
    console.error("[SEED] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
