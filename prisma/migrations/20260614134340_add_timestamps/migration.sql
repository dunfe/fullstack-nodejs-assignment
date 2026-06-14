/*
  Warnings:

  - You are about to drop the column `createAt` on the `ScheduleTask` table. All the data in the column will be lost.
  - You are about to drop the column `createAt` on the `TaskRun` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ScheduleTask" DROP COLUMN "createAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TaskRun" DROP COLUMN "createAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
