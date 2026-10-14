ALTER TABLE "industry_mine_resources"
  ADD COLUMN "district" TEXT;

-- 根据原始经纬度反查行政区划。无法稳定定位到区县的记录保持为空，后续人工核实。
UPDATE "industry_mine_resources"
SET
  "district" = CASE "id"
    WHEN 'industry_mine_region_53892' THEN '含山县'
    WHEN 'industry_mine_region_58259' THEN '旌德县'
    WHEN 'industry_mine_region_54266' THEN '怀柔区'
    WHEN 'industry_mine_region_50136' THEN '浦城县'
    WHEN 'industry_mine_region_56543' THEN '乳源瑶族自治县'
    WHEN 'industry_mine_region_57051' THEN '柳北区'
    WHEN 'industry_mine_region_59278' THEN '汇川区'
    WHEN 'industry_mine_region_54830' THEN '德江县'
    WHEN 'industry_mine_region_58040' THEN '白沙黎族自治县'
    WHEN 'industry_mine_region_53704' THEN '丰宁满族自治县'
    WHEN 'industry_mine_region_51828' THEN '卧龙区'
    WHEN 'industry_mine_region_57485' THEN '娄星区'
    WHEN 'industry_mine_region_57590' THEN '北湖区'
    WHEN 'industry_mine_region_54249' THEN '磐石市'
    WHEN 'industry_mine_region_59046' THEN '赣县区'
    WHEN 'industry_mine_region_52754' THEN '信州区'
    WHEN 'industry_mine_region_56298' THEN '袁州区'
    WHEN 'industry_mine_region_56396' THEN '永丰县'
    WHEN 'industry_mine_region_50884' THEN '德安县'
    WHEN 'industry_mine_region_54449' THEN '鄱阳县'
    WHEN 'industry_mine_region_59940' THEN '义县'
    WHEN 'industry_mine_region_57476' THEN '四子王旗'
    WHEN 'industry_mine_region_50850' THEN '固阳县'
    WHEN 'industry_mine_region_57127' THEN '林西县'
    WHEN 'industry_mine_region_53446' THEN '茫崖市'
    WHEN 'industry_mine_region_50971' THEN '平利县'
    WHEN 'industry_mine_region_54563' THEN '若羌县'
    WHEN 'industry_mine_region_58981' THEN '红河县'
    WHEN 'industry_mine_region_57399' THEN '富源县'
    WHEN 'industry_mine_region_57405' THEN '衢江区'
    WHEN 'industry_mine_region_57048' THEN '临安区'
    WHEN 'industry_mine_region_56875' THEN '武义县'
    WHEN 'industry_mine_region_59659' THEN '遂昌县'
    WHEN 'industry_mine_region_56951' THEN '沿河土家族自治县'
    ELSE "district"
  END,
  "province" = CASE "id"
    WHEN 'industry_mine_region_56951' THEN '贵州'
    ELSE "province"
  END,
  "city" = CASE "id"
    WHEN 'industry_mine_region_50850' THEN '包头市'
    WHEN 'industry_mine_region_56951' THEN '铜仁市'
    ELSE "city"
  END,
  "source" = '中国萤石矿分布地区.csv；OpenStreetMap Nominatim坐标反查',
  "remark" = CASE "id"
    WHEN 'industry_mine_region_50850' THEN '来源点位编号：50850；原始地区名称“乌兰察布市 集宁”与坐标反查结果“包头市固阳县”不一致，当前行政区划按坐标记录，需人工复核。'
    WHEN 'industry_mine_region_56951' THEN '来源点位编号：56951；原始地区名称“彭水县”与坐标反查结果“贵州省铜仁市沿河土家族自治县”不一致，当前行政区划按坐标记录，需人工复核。'
    ELSE "remark"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" LIKE 'industry_mine_region_%';
