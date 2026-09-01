-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminToken" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dateMin" TEXT NOT NULL,
    "dateMax" TEXT NOT NULL,
    "granularity" INTEGER NOT NULL,
    "dayStart" INTEGER NOT NULL,
    "dayEnd" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Participant_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "startUtc" TEXT NOT NULL,
    CONSTRAINT "Slot_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Poll_adminToken_key" ON "Poll"("adminToken");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_token_key" ON "Participant"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_participantId_startUtc_key" ON "Slot"("participantId", "startUtc");
