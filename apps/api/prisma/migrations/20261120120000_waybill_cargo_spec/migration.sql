ALTER TABLE "waybills" ADD COLUMN "cargoSpec" TEXT;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_cargoSpec_check" CHECK ("cargoSpec" IS NULL OR "cargoSpec" IN ('FRAGMENT', 'RUN_OF_MINE'));
