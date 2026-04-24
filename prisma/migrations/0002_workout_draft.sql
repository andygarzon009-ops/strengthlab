-- CreateTable
CREATE TABLE "WorkoutDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDraft_userId_key" ON "WorkoutDraft"("userId");

-- AddForeignKey
ALTER TABLE "WorkoutDraft" ADD CONSTRAINT "WorkoutDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
