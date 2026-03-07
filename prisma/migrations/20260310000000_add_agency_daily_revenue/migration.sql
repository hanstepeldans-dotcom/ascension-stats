-- CreateTable
CREATE TABLE "agency_daily_revenues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "fanvue" REAL NOT NULL DEFAULT 0,
    "infloww" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agency_daily_revenues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "agency_daily_revenues_userId_date_key" ON "agency_daily_revenues"("userId", "date");

-- CreateIndex
CREATE INDEX "agency_daily_revenues_userId_idx" ON "agency_daily_revenues"("userId");

-- CreateIndex
CREATE INDEX "agency_daily_revenues_userId_date_idx" ON "agency_daily_revenues"("userId", "date");
