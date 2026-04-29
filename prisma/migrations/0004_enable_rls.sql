-- Lock down PostgREST (anon / authenticated roles) on every public
-- table. The app talks to Postgres via Prisma using the `postgres`
-- role, which is the table owner and therefore bypasses RLS — so
-- enabling RLS without adding any policies blocks the auto-exposed
-- REST + Realtime surface while leaving server-side queries intact.

ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Workout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WorkoutExercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Set" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Exercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PersonalRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GroupPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Reaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Challenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChallengeParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TrainerMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WorkoutDraft" ENABLE ROW LEVEL SECURITY;
