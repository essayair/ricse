ALTER TABLE "wechat_identities"
  ADD COLUMN "nickName" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WECHAT_MINI_PROGRAM',
  ADD COLUMN "linkedUserId" TEXT,
  ADD COLUMN "linkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "wechat_identities_linkedUserId_key"
  ON "wechat_identities"("linkedUserId");
CREATE INDEX "wechat_identities_phone_idx"
  ON "wechat_identities"("phone");
CREATE INDEX "wechat_identities_status_createdAt_idx"
  ON "wechat_identities"("status", "createdAt");

ALTER TABLE "wechat_identities"
  ADD CONSTRAINT "wechat_identities_linkedUserId_fkey"
  FOREIGN KEY ("linkedUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "wechat_account_bindings" (
  "id" TEXT NOT NULL,
  "wechatIdentityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "operatedById" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wechat_account_bindings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wechat_account_bindings_wechatIdentityId_createdAt_idx"
  ON "wechat_account_bindings"("wechatIdentityId", "createdAt");
CREATE INDEX "wechat_account_bindings_userId_createdAt_idx"
  ON "wechat_account_bindings"("userId", "createdAt");

ALTER TABLE "wechat_account_bindings"
  ADD CONSTRAINT "wechat_account_bindings_wechatIdentityId_fkey"
  FOREIGN KEY ("wechatIdentityId") REFERENCES "wechat_identities"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wechat_account_bindings"
  ADD CONSTRAINT "wechat_account_bindings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wechat_account_bindings"
  ADD CONSTRAINT "wechat_account_bindings_operatedById_fkey"
  FOREIGN KEY ("operatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
