-- AlterTable: store short error message when OAuth fails
ALTER TABLE "provider_connections" ADD COLUMN "lastError" TEXT;
