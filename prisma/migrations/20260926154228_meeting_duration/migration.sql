-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "dateMin" TEXT NOT NULL,
    "dateMax" TEXT NOT NULL,
    "granularity" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "dayStart" INTEGER NOT NULL,
    "dayEnd" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Meeting_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Meeting" ("createdAt", "dateMax", "dateMin", "dayEnd", "dayStart", "granularity", "id", "ownerId", "title") SELECT "createdAt", "dateMax", "dateMin", "dayEnd", "dayStart", "granularity", "id", "ownerId", "title" FROM "Meeting";
DROP TABLE "Meeting";
ALTER TABLE "new_Meeting" RENAME TO "Meeting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
