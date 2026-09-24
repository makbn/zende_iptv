-- AlterTable
ALTER TABLE "IptvProvider" ADD COLUMN "backupServerUrl" TEXT;
ALTER TABLE "IptvProvider" ADD COLUMN "useBackupServer" BOOLEAN NOT NULL DEFAULT false;
