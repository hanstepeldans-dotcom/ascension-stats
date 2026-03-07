-- CreateTable
CREATE TABLE "fanvue_creators" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fanvueUuid" TEXT NOT NULL,
    "handle" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fanvue_creators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fanvue_creator_daily_earnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "total" REAL NOT NULL DEFAULT 0,
    "messages" REAL NOT NULL DEFAULT 0,
    "tips" REAL NOT NULL DEFAULT 0,
    "subscriptions" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fanvue_creator_daily_earnings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "fanvue_creators" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "fanvue_creators_userId_fanvueUuid_key" ON "fanvue_creators"("userId", "fanvueUuid");

-- CreateIndex
CREATE INDEX "fanvue_creators_userId_idx" ON "fanvue_creators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "fanvue_creator_daily_earnings_creatorId_date_key" ON "fanvue_creator_daily_earnings"("creatorId", "date");

-- CreateIndex
CREATE INDEX "fanvue_creator_daily_earnings_creatorId_idx" ON "fanvue_creator_daily_earnings"("creatorId");

-- CreateIndex
CREATE INDEX "fanvue_creator_daily_earnings_creatorId_date_idx" ON "fanvue_creator_daily_earnings"("creatorId", "date");
