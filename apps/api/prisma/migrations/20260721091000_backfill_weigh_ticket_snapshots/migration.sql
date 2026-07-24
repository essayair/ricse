UPDATE "weigh_tickets" wt
SET "materialSpec" = source."materialSpec"
FROM (
  SELECT wli."waybillId", string_agg(DISTINCT COALESCE(NULLIF(m."spec", ''), NULLIF(m."grade", '')), '、') AS "materialSpec"
  FROM "waybill_line_items" wli
  JOIN "materials" m ON m."id" = wli."materialId"
  GROUP BY wli."waybillId"
) source
WHERE wt."waybillId" = source."waybillId" AND wt."materialSpec" IS NULL;

UPDATE "weigh_tickets" wt
SET
  "shipperName" = CASE WHEN dn."type" = 'PURCHASE' THEN seller."name" ELSE signing."name" END,
  "receiverName" = CASE
    WHEN dn."type" = 'PURCHASE' THEN signing."name"
    WHEN c."type" = 'BILATERAL' THEN buyer."name"
    ELSE seller."name"
  END
FROM "waybills" w
JOIN "dispatch_notices" dn ON dn."id" = w."dispatchNoticeId"
JOIN "orders" o ON o."id" = dn."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
LEFT JOIN "partners" seller ON seller."id" = c."sellerId"
LEFT JOIN "partners" buyer ON buyer."id" = c."buyerId"
LEFT JOIN "partners" signing ON signing."id" = c."signingPartnerId"
WHERE wt."waybillId" = w."id";
