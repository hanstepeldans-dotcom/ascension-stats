-- AlterTable: store token exchange diagnostics (dev-only, no secrets)
ALTER TABLE "provider_connections" ADD COLUMN "lastDebugJson" TEXT;
