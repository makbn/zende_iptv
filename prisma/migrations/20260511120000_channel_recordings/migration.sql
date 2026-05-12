-- Channel recordings: scheduled windows and completed MP4 assets.

CREATE TABLE "RecordingSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelLogo" TEXT,
    "channelGroup" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Recording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "channelUrl" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelLogo" TEXT,
    "channelGroup" TEXT,
    "relativePath" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "plannedSeconds" INTEGER,
    "sizeBytes" BIGINT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recording_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "RecordingSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RecordingSchedule_ownerUserId_startsAt_idx" ON "RecordingSchedule"("ownerUserId", "startsAt");
CREATE INDEX "RecordingSchedule_status_startsAt_idx" ON "RecordingSchedule"("status", "startsAt");
CREATE INDEX "Recording_ownerUserId_createdAt_idx" ON "Recording"("ownerUserId", "createdAt" DESC);
CREATE INDEX "Recording_ownerUserId_status_idx" ON "Recording"("ownerUserId", "status");
