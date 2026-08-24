UPDATE "content_data_sources"
SET "config" = COALESCE("config", '{}'::jsonb) || '{
  "query":"fluorspar sourcelang:Chinese",
  "queries":[
    "fluorspar sourcelang:Chinese",
    "\"fluorite mineral\" sourcelang:Chinese",
    "\"hydrofluoric acid\" sourcelang:Chinese",
    "\"aluminum fluoride\" sourcelang:Chinese",
    "refrigerant sourcelang:Chinese",
    "\"fluorine chemical\" sourcelang:Chinese"
  ],
  "queryRotationHours":2,
  "maxRecords":30
}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GDELT_FLUORITE_NEWS';
