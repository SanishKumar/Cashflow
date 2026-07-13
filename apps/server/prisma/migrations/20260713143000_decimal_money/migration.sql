-- Store financial values as fixed-point decimals instead of binary floats.
-- Existing values are rounded only at the declared database precision.
ALTER TABLE "transactions"
  ALTER COLUMN "amount" TYPE DECIMAL(19, 4) USING ROUND("amount"::numeric, 4),
  ALTER COLUMN "exchangeRate" TYPE DECIMAL(20, 10) USING ROUND("exchangeRate"::numeric, 10);

ALTER TABLE "debt_shares"
  ALTER COLUMN "amount" TYPE DECIMAL(19, 4) USING ROUND("amount"::numeric, 4);
