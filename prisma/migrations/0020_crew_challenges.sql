-- Follow-based crew challenges. Standings computed on read from members'
-- logged workouts; nothing pre-scored. Old group Challenge tables untouched.
CREATE TABLE "CrewChallenge" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exerciseId" TEXT,
    "targetValue" DOUBLE PRECISION,
    "targetReps" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrewChallenge_creatorId_idx" ON "CrewChallenge"("creatorId");
ALTER TABLE "CrewChallenge" ADD CONSTRAINT "CrewChallenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CrewChallengeMember" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewChallengeMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrewChallengeMember_challengeId_userId_key" ON "CrewChallengeMember"("challengeId", "userId");
CREATE INDEX "CrewChallengeMember_userId_idx" ON "CrewChallengeMember"("userId");
ALTER TABLE "CrewChallengeMember" ADD CONSTRAINT "CrewChallengeMember_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CrewChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewChallengeMember" ADD CONSTRAINT "CrewChallengeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
