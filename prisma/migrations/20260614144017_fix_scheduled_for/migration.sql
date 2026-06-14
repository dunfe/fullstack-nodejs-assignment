/*
  Warnings:

  - You are about to drop the column `scheduleFor` on the `TaskRun` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TaskRun" DROP COLUMN "scheduleFor",
ADD COLUMN     "scheduledFor" TIMESTAMP(3);
