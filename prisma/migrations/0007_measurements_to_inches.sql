-- Convert existing body measurements from centimeters to inches.
-- Stored values remain Float; only the unit interpretation changes.
-- 1 inch = 2.54 cm. Rounded to 1 decimal place.

UPDATE "User" SET
  height    = ROUND((height    / 2.54)::numeric, 1)::float8,
  waist     = ROUND((waist     / 2.54)::numeric, 1)::float8,
  hips      = ROUND((hips      / 2.54)::numeric, 1)::float8,
  chest     = ROUND((chest     / 2.54)::numeric, 1)::float8,
  shoulders = ROUND((shoulders / 2.54)::numeric, 1)::float8,
  neck      = ROUND((neck      / 2.54)::numeric, 1)::float8,
  arm       = ROUND((arm       / 2.54)::numeric, 1)::float8,
  forearm   = ROUND((forearm   / 2.54)::numeric, 1)::float8,
  thigh     = ROUND((thigh     / 2.54)::numeric, 1)::float8,
  calf      = ROUND((calf      / 2.54)::numeric, 1)::float8
WHERE
  height    IS NOT NULL OR
  waist     IS NOT NULL OR
  hips      IS NOT NULL OR
  chest     IS NOT NULL OR
  shoulders IS NOT NULL OR
  neck      IS NOT NULL OR
  arm       IS NOT NULL OR
  forearm   IS NOT NULL OR
  thigh     IS NOT NULL OR
  calf      IS NOT NULL;
