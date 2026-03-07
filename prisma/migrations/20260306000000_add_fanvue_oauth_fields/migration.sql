-- AlterTable: add OAuth and connection timestamp fields to provider_connections
ALTER TABLE "provider_connections" ADD COLUMN "oauthState" TEXT;
ALTER TABLE "provider_connections" ADD COLUMN "oauthStateExpiresAt" DATETIME;
ALTER TABLE "provider_connections" ADD COLUMN "connectedAt" DATETIME;

-- CreateIndex: unique state for callback lookup
CREATE UNIQUE INDEX "provider_connections_oauthState_key" ON "provider_connections"("oauthState");
