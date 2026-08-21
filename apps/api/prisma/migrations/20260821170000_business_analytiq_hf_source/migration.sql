INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "createdAt", "updatedAt"
) VALUES (
  'content_source_business_analytiq_hf',
  'BUSINESS_ANALYTIQ_HF',
  'Business Analytiq 国际氢氟酸行情',
  'API',
  'ACTIVE',
  '15 6 * * *',
  '{"url":"https://businessanalytiq.com/procurementanalytics/index/hydrofluoric-acid-price-index/","frequency":"daily","dataFrequency":"monthly"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "schedule" = EXCLUDED."schedule",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;
