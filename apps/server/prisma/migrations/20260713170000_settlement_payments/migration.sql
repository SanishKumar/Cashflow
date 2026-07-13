-- Settlement payments are a separate workflow from expenses. Pending payments
-- do not change balances; only recipient-confirmed payments do.
CREATE TYPE "SettlementPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SETTLEMENT_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SETTLEMENT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SETTLEMENT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SETTLEMENT_CANCELLED';

CREATE TABLE "settlement_payments" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "amount" DECIMAL(19, 4) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "SettlementPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "settlement_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "settlement_payments"
  ADD CONSTRAINT "settlement_payments_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlement_payments"
  ADD CONSTRAINT "settlement_payments_fromUserId_fkey"
  FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_payments"
  ADD CONSTRAINT "settlement_payments_toUserId_fkey"
  FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve records created by the previous UI, then remove those synthetic
-- transactions so confirmed payments are not counted twice in balances.
INSERT INTO "settlement_payments" (
  "id", "groupId", "fromUserId", "toUserId", "amount", "currency",
  "status", "createdAt", "decidedAt"
)
SELECT
  'legacy_' || transaction."id",
  transaction."groupId",
  transaction."paidById",
  share."owedById",
  transaction."amount",
  group_record."currency",
  CASE transaction."status"::text
    WHEN 'COMPLETED' THEN 'CONFIRMED'::"SettlementPaymentStatus"
    WHEN 'REJECTED' THEN 'REJECTED'::"SettlementPaymentStatus"
    ELSE 'PENDING'::"SettlementPaymentStatus"
  END,
  transaction."createdAt",
  CASE WHEN transaction."status"::text = 'PENDING' THEN NULL ELSE transaction."updatedAt" END
FROM "transactions" AS transaction
JOIN "groups" AS group_record ON group_record."id" = transaction."groupId"
JOIN LATERAL (
  SELECT debt_share."owedById"
  FROM "debt_shares" AS debt_share
  WHERE debt_share."transactionId" = transaction."id"
  ORDER BY debt_share."id"
  LIMIT 1
) AS share ON TRUE
WHERE transaction."description" LIKE 'Settlement:%';

DELETE FROM "transactions" WHERE "description" LIKE 'Settlement:%';

-- If the old workaround produced duplicates, retain the newest pending item
-- and keep older records as rejected history before enforcing idempotency.
WITH ranked_pending AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "groupId", "fromUserId", "toUserId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS pending_rank
  FROM "settlement_payments"
  WHERE "status" = 'PENDING'
)
UPDATE "settlement_payments" AS payment
SET "status" = 'REJECTED', "decidedAt" = CURRENT_TIMESTAMP,
    "decisionNote" = 'Superseded during settlement-payment migration'
FROM ranked_pending
WHERE payment."id" = ranked_pending."id" AND ranked_pending.pending_rank > 1;

CREATE INDEX "settlement_payments_groupId_createdAt_idx" ON "settlement_payments"("groupId", "createdAt");
CREATE INDEX "settlement_payments_fromUserId_status_idx" ON "settlement_payments"("fromUserId", "status");
CREATE INDEX "settlement_payments_toUserId_status_idx" ON "settlement_payments"("toUserId", "status");
CREATE UNIQUE INDEX "settlement_payments_one_pending_pair_idx"
  ON "settlement_payments"("groupId", "fromUserId", "toUserId")
  WHERE "status" = 'PENDING';
