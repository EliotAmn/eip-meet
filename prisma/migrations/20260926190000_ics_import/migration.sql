-- AlterTable
ALTER TABLE "Unavailability" ADD COLUMN "icsHash" TEXT;
ALTER TABLE "Unavailability" ADD COLUMN "icsKey" TEXT;
ALTER TABLE "Unavailability" ADD COLUMN "icsSource" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Unavailability_userId_icsKey_key" ON "Unavailability"("userId", "icsKey");
