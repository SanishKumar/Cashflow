-- Baseline the schema for both existing beta databases and fresh installs.
-- Existing deployments already have these tables from the earlier `db push`
-- workflow, so the guarded block intentionally leaves them untouched.
CREATE SCHEMA IF NOT EXISTS "public";

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'PENDING', 'REJECTED');
    CREATE TYPE "GroupRole" AS ENUM ('ADMIN', 'MEMBER', 'AUDITOR');
    CREATE TYPE "AuditAction" AS ENUM (
      'GROUP_CREATED', 'GROUP_DELETED', 'GROUP_UPDATED', 'MEMBER_ADDED',
      'MEMBER_REMOVED', 'MEMBER_LEFT', 'ROLE_CHANGED', 'EXPENSE_ADDED',
      'EXPENSE_DELETED', 'EXPENSE_UPDATED', 'SETTLEMENT_COMPLETED',
      'EXPORT_CSV', 'EXPORT_PDF', 'EXPORT_EMAIL', 'USER_LOGIN',
      'USER_REGISTER', 'USER_LOGOUT'
    );

    CREATE TABLE "users" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "avatarUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "users_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "sessions" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "refreshToken" TEXT NOT NULL,
      "userAgent" TEXT,
      "ipAddress" TEXT,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "groups" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "group_members" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "transactions" (
      "id" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "paidById" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "originalCurrency" TEXT,
      "exchangeRate" DOUBLE PRECISION,
      "description" TEXT NOT NULL,
      "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "debt_shares" (
      "id" TEXT NOT NULL,
      "transactionId" TEXT NOT NULL,
      "owedById" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      CONSTRAINT "debt_shares_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "audit_logs" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "groupId" TEXT,
      "action" "AuditAction" NOT NULL,
      "details" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
    );

    CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
    CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");
    CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
    CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");
    CREATE INDEX "group_members_groupId_idx" ON "group_members"("groupId");
    CREATE UNIQUE INDEX "group_members_userId_groupId_key" ON "group_members"("userId", "groupId");
    CREATE INDEX "transactions_groupId_idx" ON "transactions"("groupId");
    CREATE INDEX "transactions_paidById_idx" ON "transactions"("paidById");
    CREATE INDEX "debt_shares_transactionId_idx" ON "debt_shares"("transactionId");
    CREATE INDEX "debt_shares_owedById_idx" ON "debt_shares"("owedById");
    CREATE INDEX "audit_logs_groupId_idx" ON "audit_logs"("groupId");
    CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
    CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
    CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paidById_fkey"
      FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "debt_shares" ADD CONSTRAINT "debt_shares_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "debt_shares" ADD CONSTRAINT "debt_shares_owedById_fkey"
      FOREIGN KEY ("owedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
