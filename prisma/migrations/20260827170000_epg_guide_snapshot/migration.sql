CREATE TABLE "EpgGuideSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "formatVersion" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "providerCount" INTEGER NOT NULL,
    "channelCount" INTEGER NOT NULL,
    "programmeCount" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
