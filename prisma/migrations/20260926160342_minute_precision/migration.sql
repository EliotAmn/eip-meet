-- Meetings: drop granularity (availability is now computed to the minute).
-- Guests: painting step preference; painted slots become [start, end) intervals.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Guest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "timezone" TEXT,
    "step" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Guest" ("createdAt", "id", "meetingId", "name", "timezone", "token") SELECT "createdAt", "id", "meetingId", "name", "timezone", "token" FROM "Guest";
DROP TABLE "Guest";
ALTER TABLE "new_Guest" RENAME TO "Guest";
CREATE UNIQUE INDEX "Guest_token_key" ON "Guest"("token");
CREATE TABLE "new_GuestSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guestId" TEXT NOT NULL,
    "startUtc" TEXT NOT NULL,
    "endUtc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'yes',
    CONSTRAINT "GuestSlot_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Existing slots become intervals: end = start + the meeting's former granularity.
INSERT INTO "new_GuestSlot" ("guestId", "id", "startUtc", "endUtc", "status")
SELECT s."guestId", s."id", s."startUtc",
       strftime('%Y-%m-%dT%H:%M:%SZ', s."startUtc", '+' || m."granularity" || ' minutes'),
       s."status"
FROM "GuestSlot" s
JOIN "Guest" g ON g."id" = s."guestId"
JOIN "Meeting" m ON m."id" = g."meetingId";
DROP TABLE "GuestSlot";
ALTER TABLE "new_GuestSlot" RENAME TO "GuestSlot";
CREATE UNIQUE INDEX "GuestSlot_guestId_startUtc_key" ON "GuestSlot"("guestId", "startUtc");
CREATE TABLE "new_Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "dateMin" TEXT NOT NULL,
    "dateMax" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "dayStart" INTEGER NOT NULL,
    "dayEnd" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Meeting_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Meeting" ("createdAt", "dateMax", "dateMin", "dayEnd", "dayStart", "duration", "id", "ownerId", "title") SELECT "createdAt", "dateMax", "dateMin", "dayEnd", "dayStart", "duration", "id", "ownerId", "title" FROM "Meeting";
DROP TABLE "Meeting";
ALTER TABLE "new_Meeting" RENAME TO "Meeting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
