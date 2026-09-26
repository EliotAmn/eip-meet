-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "startUtc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'yes',
    CONSTRAINT "Slot_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Slot" ("id", "participantId", "startUtc") SELECT "id", "participantId", "startUtc" FROM "Slot";
DROP TABLE "Slot";
ALTER TABLE "new_Slot" RENAME TO "Slot";
CREATE UNIQUE INDEX "Slot_participantId_startUtc_key" ON "Slot"("participantId", "startUtc");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
