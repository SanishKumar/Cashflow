// ──────────────────────────────────────────────
// Database Seed — Demo Data with Roles
// ──────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[SEED] Cleaning existing data...");
  await prisma.auditLog.deleteMany();
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

  console.log("[SEED] Creating groups with roles...");
  const engineeringGroup = await prisma.group.create({
    data: {
      name: "Engineering Team",
      description: "Shared expenses for the engineering team",
      members: {
        create: [
          { userId: alex.id, role: "ADMIN" },
          { userId: sarah.id, role: "MEMBER" },
          { userId: mike.id, role: "MEMBER" },
          { userId: emily.id, role: "MEMBER" },
          { userId: chris.id, role: "MEMBER" },
        ],
      },
    },
  });

  const tripGroup = await prisma.group.create({
    data: {
      name: "SF Weekend Trip",
      description: "Weekend getaway expenses",
      members: {
        create: [
          { userId: sarah.id, role: "ADMIN" },
          { userId: alex.id, role: "MEMBER" },
          { userId: mike.id, role: "MEMBER" },
        ],
      },
    },
  });

  console.log("[SEED] Created 2 groups with roles.");

  console.log("[SEED] Creating transactions...");

  // Engineering Team transactions
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

  // Create initial audit log entries
  await prisma.auditLog.createMany({
    data: [
      { userId: alex.id, groupId: engineeringGroup.id, action: "GROUP_CREATED", details: 'Created group "Engineering Team"' },
      { userId: sarah.id, groupId: tripGroup.id, action: "GROUP_CREATED", details: 'Created group "SF Weekend Trip"' },
      { userId: alex.id, groupId: engineeringGroup.id, action: "EXPENSE_ADDED", details: "Added expense \"AWS Hosting Bill - Q3\" for 4250" },
      { userId: sarah.id, groupId: engineeringGroup.id, action: "EXPENSE_ADDED", details: "Added expense \"Team Lunch - SF Office\" for 340.5" },
      { userId: alex.id, groupId: engineeringGroup.id, action: "EXPENSE_ADDED", details: "Added expense \"GitHub Enterprise Licenses\" for 1200" },
    ],
  });

  console.log("[SEED] Created 7 transactions with debt shares.");
  console.log("[SEED] Created initial audit log entries.");
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
