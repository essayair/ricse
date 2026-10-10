-- 司机采用“一人一档”：有效档案手机号全平台唯一，身份证号/驾驶证号填写后全平台唯一。
-- 迁移仅自动归档没有任何运单、车辆、车队引用的重复空档案；有业务引用的冲突必须人工处理。

DROP INDEX IF EXISTS "drivers_serviceOrganizationId_phone_key";

WITH ranked AS (
  SELECT d."id",
         ROW_NUMBER() OVER (
           PARTITION BY d."phone"
           ORDER BY (
             (SELECT COUNT(*) FROM "waybills" w WHERE w."driverId" = d."id") +
             (SELECT COUNT(*) FROM "vehicle_drivers" vd WHERE vd."driverId" = d."id") +
             (SELECT COUNT(*) FROM "driver_fleets" df WHERE df."driverId" = d."id")
           ) DESC, d."createdAt" ASC, d."id" ASC
         ) AS rn,
         (SELECT COUNT(*) FROM "waybills" w WHERE w."driverId" = d."id") +
         (SELECT COUNT(*) FROM "vehicle_drivers" vd WHERE vd."driverId" = d."id") +
         (SELECT COUNT(*) FROM "driver_fleets" df WHERE df."driverId" = d."id") AS reference_count
  FROM "drivers" d
  WHERE d."deletedAt" IS NULL
), unused_duplicates AS (
  SELECT "id" FROM ranked WHERE rn > 1 AND reference_count = 0
)
UPDATE "drivers"
SET "deletedAt" = CURRENT_TIMESTAMP, "status" = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM unused_duplicates);

WITH ranked AS (
  SELECT d."id",
         ROW_NUMBER() OVER (
           PARTITION BY UPPER(d."idCardNo")
           ORDER BY (
             (SELECT COUNT(*) FROM "waybills" w WHERE w."driverId" = d."id") +
             (SELECT COUNT(*) FROM "vehicle_drivers" vd WHERE vd."driverId" = d."id") +
             (SELECT COUNT(*) FROM "driver_fleets" df WHERE df."driverId" = d."id")
           ) DESC, d."createdAt" ASC, d."id" ASC
         ) AS rn,
         (SELECT COUNT(*) FROM "waybills" w WHERE w."driverId" = d."id") +
         (SELECT COUNT(*) FROM "vehicle_drivers" vd WHERE vd."driverId" = d."id") +
         (SELECT COUNT(*) FROM "driver_fleets" df WHERE df."driverId" = d."id") AS reference_count
  FROM "drivers" d
  WHERE d."deletedAt" IS NULL AND d."idCardNo" IS NOT NULL
), unused_duplicates AS (
  SELECT "id" FROM ranked WHERE rn > 1 AND reference_count = 0
)
UPDATE "drivers"
SET "deletedAt" = CURRENT_TIMESTAMP, "status" = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM unused_duplicates);

WITH ranked AS (
  SELECT d."id",
         ROW_NUMBER() OVER (
           PARTITION BY UPPER(d."licenseNo")
           ORDER BY (
             (SELECT COUNT(*) FROM "waybills" w WHERE w."driverId" = d."id") +
             (SELECT COUNT(*) FROM "vehicle_drivers" vd WHERE vd."driverId" = d."id") +
             (SELECT COUNT(*) FROM "driver_fleets" df WHERE df."driverId" = d."id")
           ) DESC, d."createdAt" ASC, d."id" ASC
         ) AS rn,
         (SELECT COUNT(*) FROM "waybills" w WHERE w."driverId" = d."id") +
         (SELECT COUNT(*) FROM "vehicle_drivers" vd WHERE vd."driverId" = d."id") +
         (SELECT COUNT(*) FROM "driver_fleets" df WHERE df."driverId" = d."id") AS reference_count
  FROM "drivers" d
  WHERE d."deletedAt" IS NULL AND d."licenseNo" IS NOT NULL
), unused_duplicates AS (
  SELECT "id" FROM ranked WHERE rn > 1 AND reference_count = 0
)
UPDATE "drivers"
SET "deletedAt" = CURRENT_TIMESTAMP, "status" = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM unused_duplicates);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "drivers"
    WHERE "deletedAt" IS NULL
    GROUP BY "phone" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '存在具有业务引用的重复司机手机号，请先人工合并司机档案';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "drivers"
    WHERE "deletedAt" IS NULL AND "idCardNo" IS NOT NULL
    GROUP BY UPPER("idCardNo") HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '存在重复司机身份证号，请先人工合并司机档案';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "drivers"
    WHERE "deletedAt" IS NULL AND "licenseNo" IS NOT NULL
    GROUP BY UPPER("licenseNo") HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '存在重复司机驾驶证号，请先人工合并司机档案';
  END IF;
END $$;

CREATE UNIQUE INDEX "drivers_phone_active_key"
  ON "drivers"("phone")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "drivers_idCardNo_active_key"
  ON "drivers"(UPPER("idCardNo"))
  WHERE "deletedAt" IS NULL AND "idCardNo" IS NOT NULL;

CREATE UNIQUE INDEX "drivers_licenseNo_active_key"
  ON "drivers"(UPPER("licenseNo"))
  WHERE "deletedAt" IS NULL AND "licenseNo" IS NOT NULL;
