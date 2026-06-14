-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('FILE_READ', 'FILE_IMPORT', 'FORM_FILL', 'EMAIL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('ONCE', 'CRON');

-- CreateTable
CREATE TABLE "ScheduleTask" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "scheduleKind" "ScheduleKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "scheduleAt" TIMESTAMP(3),
    "cronExpr" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "correlationId" TEXT NOT NULL,
    "scheduleFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attemptNumber" INTEGER NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "createAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTask_idempotencyKey_key" ON "ScheduleTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduleTask_status_nextRunAt_idx" ON "ScheduleTask"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduleTask_type_idx" ON "ScheduleTask"("type");

-- CreateIndex
CREATE INDEX "TaskRun_taskId_idx" ON "TaskRun"("taskId");

-- CreateIndex
CREATE INDEX "TaskRun_correlationId_idx" ON "TaskRun"("correlationId");

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduleTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
