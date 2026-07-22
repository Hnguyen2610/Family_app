-- AI Reliability Upgrade production rollout for Supabase/Postgres.
--
-- Purpose:
-- - Bring production DB in sync with the AI reliability schema changes.
-- - Safe to re-run: CREATE/ALTER/INDEX statements use IF NOT EXISTS where Postgres supports it.
--
-- Notes:
-- - Prisma supplies cuid() values from the application layer, so these TEXT primary keys
--   intentionally do not use a database-side default.
-- - Prisma @updatedAt is also handled by Prisma writes, not by a database trigger.
-- - Run this in Supabase SQL Editor before enabling/deploying code that writes the new fields.
--
-- Rollback note:
-- - Prefer restoring a Supabase backup/snapshot if this has already received production writes.
-- - Dropping the new columns/tables after the app has written data can lose AI telemetry/proposals.

BEGIN;

CREATE TABLE IF NOT EXISTS "AiConversationState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyId" TEXT,
  "lastShownEvents" JSONB,
  "lastShownNotes" JSONB,
  "lastShownTasks" JSONB,
  "lastSelectedFamilyId" TEXT,
  "lastIntent" TEXT,
  "lastAssistantSummary" TEXT,
  "pendingReference" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "AiConversationState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "familyId" TEXT;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "lastShownEvents" JSONB;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "lastShownNotes" JSONB;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "lastShownTasks" JSONB;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "lastSelectedFamilyId" TEXT;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "lastIntent" TEXT;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "lastAssistantSummary" TEXT;
ALTER TABLE "AiConversationState" ADD COLUMN IF NOT EXISTS "pendingReference" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "AiConversationState_userId_key" ON "AiConversationState" ("userId");
CREATE INDEX IF NOT EXISTS "AiConversationState_userId_idx" ON "AiConversationState" ("userId");
CREATE INDEX IF NOT EXISTS "AiConversationState_expiresAt_idx" ON "AiConversationState" ("expiresAt");

CREATE TABLE IF NOT EXISTS "AiActionProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyId" TEXT,
  "source" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "targetType" TEXT,
  "targetId" TEXT,
  "riskLevel" TEXT DEFAULT 'low',
  "requiresConfirmation" BOOLEAN NOT NULL DEFAULT TRUE,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "AiActionProposal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiActionProposal" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "AiActionProposal" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE "AiActionProposal" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT DEFAULT 'low';
ALTER TABLE "AiActionProposal" ADD COLUMN IF NOT EXISTS "requiresConfirmation" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "AiActionProposal" ADD COLUMN IF NOT EXISTS "before" JSONB;
ALTER TABLE "AiActionProposal" ADD COLUMN IF NOT EXISTS "after" JSONB;

CREATE INDEX IF NOT EXISTS "AiActionProposal_userId_idx" ON "AiActionProposal" ("userId");
CREATE INDEX IF NOT EXISTS "AiActionProposal_familyId_idx" ON "AiActionProposal" ("familyId");
CREATE INDEX IF NOT EXISTS "AiActionProposal_status_idx" ON "AiActionProposal" ("status");
CREATE INDEX IF NOT EXISTS "AiActionProposal_expiresAt_idx" ON "AiActionProposal" ("expiresAt");

CREATE TABLE IF NOT EXISTS "AiRequestLog" (
  "id" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "type" TEXT NOT NULL,
  "source" TEXT,
  "intent" TEXT NOT NULL,
  "prompt" TEXT,
  "normalizedPrompt" TEXT,
  "skill" TEXT,
  "model" TEXT NOT NULL,
  "routeReason" TEXT,
  "routeConfidence" DOUBLE PRECISION,
  "toolsCalled" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ragSnippetCount" INTEGER,
  "ragQuery" TEXT,
  "ragMiss" BOOLEAN,
  "ragSources" JSONB,
  "resolverTelemetry" JSONB,
  "proposedAction" JSONB,
  "sanitizerIncidents" JSONB,
  "needsClarification" BOOLEAN NOT NULL DEFAULT FALSE,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "cached" BOOLEAN NOT NULL DEFAULT FALSE,
  "redacted" BOOLEAN NOT NULL DEFAULT FALSE,
  "userId" TEXT,
  "familyId" TEXT,
  "sessionId" TEXT,
  "error" TEXT,
  "fallbackReason" TEXT,
  "modelChoiceReason" TEXT,
  "tokenCount" INTEGER,
  "resolvedFamilyMode" TEXT,
  CONSTRAINT "AiRequestLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "prompt" TEXT;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "normalizedPrompt" TEXT;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "routeReason" TEXT;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "routeConfidence" DOUBLE PRECISION;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "resolverTelemetry" JSONB;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "proposedAction" JSONB;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "sanitizerIncidents" JSONB;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "needsClarification" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "modelChoiceReason" TEXT;
ALTER TABLE "AiRequestLog" ADD COLUMN IF NOT EXISTS "resolvedFamilyMode" TEXT;

CREATE INDEX IF NOT EXISTS "AiRequestLog_timestamp_idx" ON "AiRequestLog" ("timestamp");
CREATE INDEX IF NOT EXISTS "AiRequestLog_familyId_idx" ON "AiRequestLog" ("familyId");
CREATE INDEX IF NOT EXISTS "AiRequestLog_intent_idx" ON "AiRequestLog" ("intent");
CREATE INDEX IF NOT EXISTS "AiRequestLog_skill_idx" ON "AiRequestLog" ("skill");
CREATE INDEX IF NOT EXISTS "AiRequestLog_model_idx" ON "AiRequestLog" ("model");
CREATE INDEX IF NOT EXISTS "AiRequestLog_cached_idx" ON "AiRequestLog" ("cached");

CREATE TABLE IF NOT EXISTS "AiRequestFeedback" (
  "id" TEXT NOT NULL,
  "requestLogId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "userId" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AiRequestFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiRequestFeedback_requestLogId_idx" ON "AiRequestFeedback" ("requestLogId");
CREATE INDEX IF NOT EXISTS "AiRequestFeedback_value_idx" ON "AiRequestFeedback" ("value");
CREATE INDEX IF NOT EXISTS "AiRequestFeedback_createdAt_idx" ON "AiRequestFeedback" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AiRequestFeedback_requestLogId_fkey'
  ) THEN
    ALTER TABLE "AiRequestFeedback"
      ADD CONSTRAINT "AiRequestFeedback_requestLogId_fkey"
      FOREIGN KEY ("requestLogId")
      REFERENCES "AiRequestLog"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Post-deploy validation queries.
-- Run these after COMMIT. They should return rows for all expected columns/indexes.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('AiConversationState', 'AiActionProposal', 'AiRequestLog', 'AiRequestFeedback')
ORDER BY table_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'AiConversationState' AND column_name IN ('lastShownEvents', 'lastShownNotes', 'lastShownTasks', 'lastSelectedFamilyId', 'expiresAt'))
    OR (table_name = 'AiActionProposal' AND column_name IN ('targetType', 'targetId', 'riskLevel', 'requiresConfirmation', 'before', 'after'))
    OR (table_name = 'AiRequestLog' AND column_name IN ('source', 'prompt', 'normalizedPrompt', 'routeReason', 'routeConfidence', 'resolverTelemetry', 'proposedAction', 'sanitizerIncidents', 'needsClarification', 'modelChoiceReason', 'resolvedFamilyMode'))
    OR (table_name = 'AiRequestFeedback' AND column_name IN ('requestLogId', 'value', 'source'))
  )
ORDER BY table_name, column_name;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('AiConversationState', 'AiActionProposal', 'AiRequestLog', 'AiRequestFeedback')
ORDER BY tablename, indexname;
