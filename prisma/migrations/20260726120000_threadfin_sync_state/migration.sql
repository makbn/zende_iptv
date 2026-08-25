-- CreateTable
CREATE TABLE "ThreadfinSyncState" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "portalUsername" TEXT NOT NULL DEFAULT 'threadfin',
    "lastSyncAt" DATETIME,
    "lastSyncOk" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncError" TEXT,
    "lastCountsJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);
