CREATE TABLE "ParentalControlSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "patternsJson" TEXT NOT NULL DEFAULT '[]',
    "pinHash" TEXT,
    "updatedAt" DATETIME NOT NULL
);
