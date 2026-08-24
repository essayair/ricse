UPDATE "content_data_sources"
SET "config" = COALESCE("config", '{}'::jsonb) || '{"transport":"http"}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GDELT_FLUORITE_NEWS';
