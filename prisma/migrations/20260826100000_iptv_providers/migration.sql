CREATE TABLE "IptvProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serverUrl" TEXT,
    "username" TEXT,
    "password" TEXT,
    "playlistUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "IptvProviderChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT -1,
    "contentType" TEXT,
    "tvgId" TEXT,
    "tvgLogo" TEXT,
    "tvgLanguage" TEXT,
    "groupTitle" TEXT,
    "description" TEXT,
    "addedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IptvProviderChannel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IptvProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "IptvProviderChannel_providerId_externalKey_key" ON "IptvProviderChannel"("providerId", "externalKey");
CREATE INDEX "IptvProviderChannel_providerId_name_idx" ON "IptvProviderChannel"("providerId", "name");
CREATE INDEX "IptvProviderChannel_url_idx" ON "IptvProviderChannel"("url");
CREATE INDEX "IptvProviderChannel_addedByUserId_idx" ON "IptvProviderChannel"("addedByUserId");
