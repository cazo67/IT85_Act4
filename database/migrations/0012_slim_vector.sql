CREATE TYPE "public"."invoice_status_next" AS ENUM('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');
ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invoices"
  ALTER COLUMN "status" TYPE "public"."invoice_status_next"
  USING (
    CASE
      WHEN "status"::text = 'OPEN' AND "paid_centavos" > 0 AND "paid_centavos" < "total_centavos"
        THEN 'PARTIALLY_PAID'
      ELSE "status"::text
    END
  )::"public"."invoice_status_next";
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'OPEN';
DROP TYPE "public"."invoice_status";
ALTER TYPE "public"."invoice_status_next" RENAME TO "invoice_status";
