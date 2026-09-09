ALTER TABLE "UserViewingHistory" ADD COLUMN "contentKey" TEXT;

CREATE UNIQUE INDEX "UserViewingHistory_userId_contentKey_key"
ON "UserViewingHistory"("userId", "contentKey");
