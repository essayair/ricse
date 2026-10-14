UPDATE "industry_mine_resources"
SET "district" = CASE "id"
  WHEN 'industry_mine_region_53868' THEN '新罗区'
  WHEN 'industry_mine_region_58556' THEN '邵武市'
  WHEN 'industry_mine_region_58248' THEN '水城区'
  WHEN 'industry_mine_region_57536' THEN '张店区'
  ELSE "district"
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  'industry_mine_region_53868',
  'industry_mine_region_58556',
  'industry_mine_region_58248',
  'industry_mine_region_57536'
);
