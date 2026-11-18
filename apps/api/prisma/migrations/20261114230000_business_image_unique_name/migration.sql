ALTER TABLE "business_images" ADD COLUMN "nameKey" TEXT NOT NULL DEFAULT '';
UPDATE "business_images" b SET "nameKey" = lower(btrim(a."originalName"))
FROM "attachments" a WHERE a.id = b.id;

-- 既有资料如有重名则中止迁移，不擅自重命名用户文件。
CREATE UNIQUE INDEX "business_images_contractId_nameKey_key" ON "business_images"("contractId", "nameKey");

CREATE FUNCTION sync_business_image_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'attachments' THEN
    UPDATE "business_images" SET "nameKey" = lower(btrim(NEW."originalName")) WHERE id = NEW.id;
  ELSE
    SELECT lower(btrim(a."originalName")) INTO NEW."nameKey" FROM "attachments" a WHERE a.id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_image_name_from_attachment BEFORE INSERT OR UPDATE ON "business_images"
FOR EACH ROW EXECUTE FUNCTION sync_business_image_name();
CREATE TRIGGER business_image_name_after_rename AFTER UPDATE OF "originalName" ON "attachments"
FOR EACH ROW WHEN (OLD."originalName" IS DISTINCT FROM NEW."originalName") EXECUTE FUNCTION sync_business_image_name();
