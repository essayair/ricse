// 仅操作本机 docker-compose.yml 的 PostgreSQL 临时库，不读取/复制开发业务数据。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const database = `ricse_invoice_smoke_${Date.now()}`;
const sql = (query, db = database) => execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'ricse', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1'], { cwd: root, input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const migration = readFileSync(path.join(root, 'apps/api/prisma/migrations/20261107180000_invoice_allocations/migration.sql'), 'utf8');
const fixture = `
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE business_units (id TEXT PRIMARY KEY);
CREATE TABLE partners (id TEXT PRIMARY KEY);
CREATE TABLE contracts (id TEXT PRIMARY KEY, "businessUnitId" TEXT);
CREATE TABLE financial_settlements (id TEXT PRIMARY KEY, "businessUnitId" TEXT);
CREATE TABLE logistics_settlements (id TEXT PRIMARY KEY, "businessUnitId" TEXT);
INSERT INTO users VALUES ('operator'); INSERT INTO business_units VALUES ('bu1');
INSERT INTO partners VALUES ('seller'), ('buyer');
INSERT INTO contracts VALUES ('contract1', 'bu1');
INSERT INTO financial_settlements VALUES ('settlement1', 'bu1');
INSERT INTO logistics_settlements VALUES ('freight1', 'bu1');
${readFileSync(path.join(root, 'apps/api/prisma/migrations/20261031141000_invoice_register/migration.sql'), 'utf8')}
${readFileSync(path.join(root, 'apps/api/prisma/migrations/20261107100000_freight_invoice_records/migration.sql'), 'utf8')}
INSERT INTO invoice_records (id, "settlementId", "logisticsSettlementId", "contractId", direction, "invoiceNo", "issuedAt", "sellerPartnerId", "buyerPartnerId", "materialName", quantity, "taxInclusiveAmount", "createdBy", status, "sourceType", "voidedBy", "voidedAt") VALUES
('goods-active', 'settlement1', NULL, 'contract1', 'INPUT', '001', NOW(), 'seller', 'buyer', '矿产品', 10, 1000, 'operator', 'ACTIVE', 'GOODS', NULL, NULL),
('freight-active', NULL, 'freight1', NULL, 'INPUT', '002', NOW(), 'seller', 'buyer', '运费', NULL, 200, 'operator', 'ACTIVE', 'FREIGHT', NULL, NULL),
('freight-void', NULL, 'freight1', NULL, 'INPUT', '003', NOW(), 'seller', 'buyer', '运费', NULL, 300, 'operator', 'VOIDED', 'FREIGHT', 'operator', NOW());
`;
sql(`CREATE DATABASE "${database}";`, 'postgres');
try {
  sql(fixture);
  sql(migration);
  assert.equal(sql('SELECT COUNT(*) FROM invoice_allocations;').trim(), '3');
  assert.equal(sql('SELECT SUM(amount) FROM invoice_allocations WHERE "reversedAt" IS NULL;').trim(), '1200.00');
  assert.equal(sql(`SELECT COUNT(*) FROM invoice_allocations WHERE "invoiceId" = 'freight-void' AND "reversedAt" IS NOT NULL AND "reversedBy" = 'operator';`).trim(), '1');
  assert.equal(sql(`SELECT COUNT(*) FROM invoice_records WHERE "businessUnitId" = 'bu1';`).trim(), '3');
  assert.equal(sql(`SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'invoice_records' AND column_name IN ('settlementId', 'logisticsSettlementId');`).trim(), '0');
  // 故意设置旧数据异常，确认整笔迁移回滚，不留下半张新表或丢失旧关联。
  sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  sql(fixture);
  sql(`UPDATE invoice_records SET "taxInclusiveAmount" = 0 WHERE id = 'goods-active';`);
  assert.throws(() => sql(migration));
  assert.equal(sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'invoice_allocations';`).trim(), '0');
  assert.equal(sql(`SELECT "settlementId" FROM invoice_records WHERE id = 'goods-active';`).trim(), 'settlement1');
  console.log('发票迁移：历史货款、运费、作废记录迁移及失败原子回滚验证通过。');
} finally {
  sql(`DROP DATABASE "${database}" WITH (FORCE);`, 'postgres');
}
