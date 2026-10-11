CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "readAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "wechatStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "wechatAttempts" INTEGER NOT NULL DEFAULT 0,
    "wechatSentAt" TIMESTAMP(3),
    "wechatError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
CREATE INDEX "notifications_recipientUserId_status_createdAt_idx" ON "notifications"("recipientUserId", "status", "createdAt");
CREATE INDEX "notifications_wechatStatus_createdAt_idx" ON "notifications"("wechatStatus", "createdAt");
CREATE INDEX "notifications_businessType_businessId_idx" ON "notifications"("businessType", "businessId");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
