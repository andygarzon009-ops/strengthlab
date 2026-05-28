-- Cache the /consistency rhythm-analysis output per user. Shape:
-- { "weekKey": "2026-05-25", "trainedDays": 4, "sessionCount": 5, "analysis": {...} }
-- The page reuses the cached payload when weekKey + trainedDays + sessionCount
-- still match this week's data, so we only call the LLM on the first visit
-- after a new session is logged.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "weeklyAnalysisCache" JSONB;
