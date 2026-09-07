-- Existing proxy IDs were bearer links. Revoke these ephemeral rows before
-- introducing ownership so no pre-fix URL remains playable after deployment.
DELETE FROM "StreamProxySession";

ALTER TABLE "StreamProxySession" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "StreamProxySession" ADD COLUMN "accessGrantHash" TEXT;

CREATE INDEX "StreamProxySession_ownerUserId_idx" ON "StreamProxySession"("ownerUserId");
