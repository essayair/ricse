UPDATE "standard_commodities"
SET "name" = concat_ws(
    '-',
    NULLIF(concat(trim("baseName"), trim("commodityForm")), ''),
    NULLIF(concat(
        trim("coreSpecName"),
        trim("coreSpecOperator"),
        trim("coreSpecValue"),
        trim("coreSpecUnit")
    ), '')
);

UPDATE "materials" AS material
SET "name" = standard."name"
FROM "standard_commodities" AS standard
WHERE material."standardCommodityId" = standard."id";
