-- SQLite: migrate OpenSubtitles columns to Wyzie Subs.
ALTER TABLE "SubtitleSettings" RENAME COLUMN "opensubtitlesApiKey" TO "wyzieApiKey";
ALTER TABLE "SubtitleSettings" DROP COLUMN "opensubtitlesUsername";
ALTER TABLE "SubtitleSettings" DROP COLUMN "opensubtitlesPassword";
