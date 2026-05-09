-- CreateTable
CREATE TABLE "IptvClientCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL DEFAULT '',
    "portalUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    CONSTRAINT "IptvClientCredential_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "IptvClientCredential_portalUsername_key" ON "IptvClientCredential"("portalUsername");

-- CreateIndex
CREATE INDEX "IptvClientCredential_ownerUserId_idx" ON "IptvClientCredential"("ownerUserId");
