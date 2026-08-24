INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "createdAt", "updatedAt"
) VALUES (
  'content_source_smm_industry_rss',
  'SMM_INDUSTRY_RSS',
  '上海有色网行业动态 RSS',
  'RSS',
  'ACTIVE',
  '47 */2 * * *',
  '{
    "endpoint":"https://news.smm.cn/rss/industry",
    "sourceName":"上海有色网",
    "enforceKeywords":true,
    "keywords":["萤石","氟石","萤石矿","萤石粉","氟化工","氢氟酸","无水氟化氢","氟化铝","含氟","制冷剂"],
    "excludeKeywords":["摄像机","监控器","智能锁","随身拍","镜头","塔罗","星座","水晶","宝石","家居安防"]
  }'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "status" = 'ACTIVE',
  "schedule" = EXCLUDED."schedule",
  "config" = COALESCE("content_data_sources"."config", EXCLUDED."config"),
  "updatedAt" = CURRENT_TIMESTAMP;
