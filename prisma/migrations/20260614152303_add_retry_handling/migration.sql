-- AlterTable
ALTER TABLE "ScheduleTask" ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retryDelaySeconds" INTEGER NOT NULL DEFAULT 30;
