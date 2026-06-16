-- Playback context for VOD (duration, series episode navigation).
ALTER TABLE "StreamProxySession" ADD COLUMN "metaJson" TEXT NOT NULL DEFAULT '{}';
