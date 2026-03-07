-- CreateUniqueIndex: one connection per user per provider
CREATE UNIQUE INDEX "provider_connections_userId_provider_key" ON "provider_connections"("userId", "provider");
