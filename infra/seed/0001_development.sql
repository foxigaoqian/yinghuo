-- DEVELOPMENT ONLY. No payment account or published legal terms are created.
BEGIN;
INSERT INTO products(code,kind,sale_enabled) VALUES ('memory_year','membership',false),('enhance','image',false) ON CONFLICT(code) DO NOTHING;
INSERT INTO product_versions(product_id,version,price_fen,currency,duration_days,specs,entitlements,terms_version)
SELECT id,1,9900,'CNY',365,'{"storageBytes":5000000000,"maxFamilyMembers":5}'::jsonb,'{"memory":true}'::jsonb,'memory-year-draft'
FROM products WHERE code='memory_year' ON CONFLICT(product_id,version) DO NOTHING;
COMMIT;
