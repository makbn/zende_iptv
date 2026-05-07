-- CreateTable
CREATE TABLE "AuthConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isBootstrapAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelRegistryEntry" (
    "urlHash" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "presetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HealthProbe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "urlHash" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "httpStatus" INTEGER,
    "error" TEXT,
    CONSTRAINT "HealthProbe_urlHash_fkey" FOREIGN KEY ("urlHash") REFERENCES "ChannelRegistryEntry" ("urlHash") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HealthAggregate" (
    "urlHash" TEXT NOT NULL PRIMARY KEY,
    "tier" TEXT NOT NULL,
    "successRate" REAL NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HealthAggregate_urlHash_fkey" FOREIGN KEY ("urlHash") REFERENCES "ChannelRegistryEntry" ("urlHash") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StreamProxySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upstreamRootUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logo" TEXT,
    "groupTitle" TEXT,
    "urlAliasesJson" TEXT NOT NULL DEFAULT '{}',
    "aliasReferersJson" TEXT NOT NULL DEFAULT '{}',
    "cookieJarJson" TEXT NOT NULL DEFAULT '{}',
    "lastRefererUrl" TEXT,
    "proxyConfigJson" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProxyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "vpnType" TEXT NOT NULL DEFAULT 'direct',
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 0,
    "username" TEXT,
    "password" TEXT,
    "vpnProvider" TEXT,
    "vpnConfigJson" TEXT,
    "gluetunContainerId" TEXT,
    "gluetunHostPort" INTEGER,
    "gluetunStatus" TEXT NOT NULL DEFAULT 'stopped',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProxyConfig_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelProxyAssignment" (
    "urlHash" TEXT NOT NULL PRIMARY KEY,
    "proxyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelProxyAssignment_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "ProxyConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelProxyAssignment_urlHash_fkey" FOREIGN KEY ("urlHash") REFERENCES "ChannelRegistryEntry" ("urlHash") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tvgLogo" TEXT,
    "groupTitle" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserViewingHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tvgLogo" TEXT,
    "groupTitle" TEXT,
    "lastOpenedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "UserViewingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaylistCatalogCache" (
    "presetId" TEXT NOT NULL PRIMARY KEY,
    "channelsJson" TEXT NOT NULL,
    "channelCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ManualChannelsStore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "entriesJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "HealthProbe_urlHash_checkedAt_idx" ON "HealthProbe"("urlHash", "checkedAt");

-- CreateIndex
CREATE INDEX "StreamProxySession_expiresAt_idx" ON "StreamProxySession"("expiresAt");

-- CreateIndex
CREATE INDEX "ChannelProxyAssignment_proxyId_idx" ON "ChannelProxyAssignment"("proxyId");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_addedAt_idx" ON "UserFavorite"("userId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_url_key" ON "UserFavorite"("userId", "url");

-- CreateIndex
CREATE INDEX "UserViewingHistory_userId_lastOpenedAt_idx" ON "UserViewingHistory"("userId", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "UserViewingHistory_userId_openCount_idx" ON "UserViewingHistory"("userId", "openCount");

-- CreateIndex
CREATE UNIQUE INDEX "UserViewingHistory_userId_url_key" ON "UserViewingHistory"("userId", "url");
