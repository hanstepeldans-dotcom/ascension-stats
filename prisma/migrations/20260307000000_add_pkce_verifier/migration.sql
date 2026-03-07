-- AlterTable: add PKCE code_verifier fields for Fanvue OAuth
ALTER TABLE "provider_connections" ADD COLUMN "pkceVerifier" TEXT;
ALTER TABLE "provider_connections" ADD COLUMN "pkceVerifierExpiresAt" DATETIME;
