-- CreateTable
CREATE TABLE "SubtitleSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opensubtitlesApiKey" TEXT,
    "opensubtitlesUsername" TEXT,
    "opensubtitlesPassword" TEXT,
    "updatedAt" DATETIME NOT NULL
);
