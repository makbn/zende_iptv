ALTER TABLE "MediaMetadataCache" ADD COLUMN "imdbRating" REAL;
ALTER TABLE "MediaMetadataCache" ADD COLUMN "imdbVotes" INTEGER;
ALTER TABLE "MediaMetadataCache" ADD COLUMN "imdbRatingFetchedAt" DATETIME;

CREATE INDEX "MediaMetadataCache_mediaType_imdbRating_idx"
ON "MediaMetadataCache"("mediaType", "imdbRating");
