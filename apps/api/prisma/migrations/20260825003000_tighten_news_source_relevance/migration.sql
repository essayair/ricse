UPDATE "content_data_sources"
SET "config" = COALESCE("config", '{}'::jsonb) || '{
  "query":"(fluorspar OR \"fluorite mineral\" OR \"hydrofluoric acid\" OR \"fluorine chemical\" OR \"aluminum fluoride\" OR refrigerant) sourcelang:Chinese",
  "timespan":"3d",
  "maxRecords":50,
  "enforceKeywords":true,
  "keywords":["萤石","氟石","萤石矿","萤石粉","氟化工","氢氟酸","无水氟化氢","氟化铝","含氟","制冷剂","fluorspar","fluorite mineral","hydrofluoric acid","fluorine chemical","aluminum fluoride","refrigerant"],
  "excludeKeywords":["摄像机","监控器","智能锁","随身拍","镜头","塔罗","星座","水晶","宝石","家居安防"],
  "excludeDomains":["zol.com.cn","hindustantimes.com"]
}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GDELT_FLUORITE_NEWS';
