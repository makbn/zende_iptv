-- CreateTable
CREATE TABLE "MediaShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logo" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "StreamProxySession" ADD COLUMN "absoluteExpiresAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "MediaShare_token_key" ON "MediaShare"("token");
CREATE INDEX "MediaShare_createdByUserId_createdAt_idx" ON "MediaShare"("createdByUserId", "createdAt" DESC);
CREATE INDEX "MediaShare_expiresAt_idx" ON "MediaShare"("expiresAt");
CREATE INDEX "StreamProxySession_absoluteExpiresAt_idx" ON "StreamProxySession"("absoluteExpiresAt");
