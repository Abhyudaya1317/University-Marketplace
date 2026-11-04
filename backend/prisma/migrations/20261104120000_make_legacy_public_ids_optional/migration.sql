-- Keep leftover publicId columns from the reverted ID experiment harmless.
-- Current application code uses the existing numeric primary keys and does not
-- read or write publicId. Making these legacy columns nullable lets Prisma
-- create records without dropping columns or changing any stored values.
DO $migration$
DECLARE
    legacy_table RECORD;
BEGIN
    FOR legacy_table IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name = 'publicId'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL',
            current_schema(),
            legacy_table.table_name,
            'publicId'
        );
    END LOOP;
END
$migration$;
