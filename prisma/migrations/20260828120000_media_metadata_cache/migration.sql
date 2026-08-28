CREATE TABLE "MediaMetadataCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaKey" TEXT NOT NULL,
    "providerChannelId" TEXT,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tmdbId" TEXT,
    "imdbId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaMetadataCache_providerChannelId_fkey"
      FOREIGN KEY ("providerChannelId") REFERENCES "IptvProviderChannel" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MediaMetadataCache_mediaKey_key" ON "MediaMetadataCache"("mediaKey");
CREATE UNIQUE INDEX "MediaMetadataCache_providerChannelId_key" ON "MediaMetadataCache"("providerChannelId");
CREATE INDEX "MediaMetadataCache_mediaType_tmdbId_idx" ON "MediaMetadataCache"("mediaType", "tmdbId");
CREATE INDEX "MediaMetadataCache_fetchedAt_idx" ON "MediaMetadataCache"("fetchedAt");
