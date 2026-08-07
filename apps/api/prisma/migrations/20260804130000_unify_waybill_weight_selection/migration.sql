-- A logistics waybill has one effective weighing ticket. The same ticket is used
-- for both inventory execution and settlement; historical selections remain.
CREATE TEMP TABLE "_effective_weight_sources" ON COMMIT DROP AS
SELECT DISTINCT ON (selection."waybillId")
  selection."waybillId",
  selection."weighTicketId",
  selection."quantity",
  selection."selectedBy",
  selection."reason"
FROM "waybill_weight_selections" selection
JOIN "weigh_tickets" ticket ON ticket."id" = selection."weighTicketId"
WHERE selection."isCurrent" = true
  AND selection."purpose" IN ('INVENTORY', 'SETTLEMENT')
  AND ticket."deletedAt" IS NULL
  AND ticket."status" <> 'VOIDED'
ORDER BY selection."waybillId",
  CASE selection."purpose" WHEN 'INVENTORY' THEN 0 ELSE 1 END,
  selection."selectedAt" DESC;

UPDATE "waybill_weight_selections" selection
SET "isCurrent" = false
FROM "_effective_weight_sources" source
WHERE selection."waybillId" = source."waybillId"
  AND selection."purpose" IN ('INVENTORY', 'SETTLEMENT')
  AND selection."isCurrent" = true;

INSERT INTO "waybill_weight_selections" (
  "id", "waybillId", "purpose", "weighTicketId", "quantity",
  "reason", "isCurrent", "selectedBy", "selectedAt"
)
SELECT
  'wsel_' || md5(source."waybillId" || purpose.value || clock_timestamp()::text || random()::text),
  source."waybillId",
  purpose.value,
  source."weighTicketId",
  source."quantity",
  CASE
    WHEN source."reason" IS NULL OR btrim(source."reason") = '' THEN '历史数据统一为结算入库磅单'
    ELSE '历史数据统一为结算入库磅单：' || source."reason"
  END,
  true,
  source."selectedBy",
  CURRENT_TIMESTAMP
FROM "_effective_weight_sources" source
CROSS JOIN (VALUES ('INVENTORY'), ('SETTLEMENT')) AS purpose(value);
