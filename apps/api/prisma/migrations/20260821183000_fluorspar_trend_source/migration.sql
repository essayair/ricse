INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "createdAt", "updatedAt"
) VALUES (
  'content_source_fluorspar_com_trend',
  'FLUORSPAR_COM_TREND',
  'fluorspar.com 萤石区域价格趋势',
  'API',
  'ACTIVE',
  '5 6 * * *',
  '{"unit":"美元/吨","regions":{"华中":"cn_vp","华东":"eu_fv","北方":"eu_vp"},"url":"https://fluorspar.com/wp-content/themes/classy-news/inc/getdata.php"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "schedule" = EXCLUDED."schedule",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;
