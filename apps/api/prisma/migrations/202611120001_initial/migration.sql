-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "clientSdkKeyHash" TEXT NOT NULL,
    "serverSdkKeyHash" TEXT NOT NULL,
    "allowedOrigins" TEXT[],

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "variations" JSONB NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlagConfig" (
    "flagId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "offVariation" INTEGER NOT NULL,
    "fallthrough" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "salt" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FlagConfig_pkey" PRIMARY KEY ("flagId","environmentId")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "environmentId" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_clientSdkKeyHash_key" ON "Environment"("clientSdkKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_serverSdkKeyHash_key" ON "Environment"("serverSdkKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_key_key" ON "Environment"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Flag_projectId_key_key" ON "Flag"("projectId", "key");

-- CreateIndex
CREATE INDEX "AuditEntry_flagId_createdAt_idx" ON "AuditEntry"("flagId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEntry_environmentId_createdAt_idx" ON "AuditEntry"("environmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlagConfig" ADD CONSTRAINT "FlagConfig_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "Flag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlagConfig" ADD CONSTRAINT "FlagConfig_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "Flag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Audit records are immutable even outside the application.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEntry is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEntry"
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
ALTER TABLE "Flag" ADD CONSTRAINT "flag_type" CHECK ("type" IN ('boolean', 'string'));
ALTER TABLE "FlagConfig" ADD CONSTRAINT "positive_version" CHECK ("version" > 0);
