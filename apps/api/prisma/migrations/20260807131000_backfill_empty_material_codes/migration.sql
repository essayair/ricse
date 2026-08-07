WITH current_sequence AS (
    SELECT COALESCE(MAX(
        CASE
            WHEN "code" ~* '^TRD[-_ ]?[0-9]+$'
            THEN regexp_replace("code", '[^0-9]', '', 'g')::INTEGER
            ELSE 0
        END
    ), 0) AS "maxCode"
    FROM "materials"
), missing_codes AS (
    SELECT
        "id",
        row_number() OVER (ORDER BY "createdAt", "id") AS "sequence"
    FROM "materials"
    WHERE trim(COALESCE("code", '')) = ''
)
UPDATE "materials" AS material
SET "code" = 'TRD' || lpad((current_sequence."maxCode" + missing_codes."sequence")::TEXT, 6, '0')
FROM missing_codes, current_sequence
WHERE material."id" = missing_codes."id";
