/// Anatomy for the body scan, in a 100 × 200 box per figure. Each shape is
/// drawn for the figure's right side (the viewer's left, x ≤ 50) and mirrored,
/// so the two halves always match. `m` names the muscle(s) a shape shows; a
/// shape standing for several shows the hottest of them.

export type BodyShape = { m: string | string[]; d: string };

/// The figure's outline, left half — the body the muscles sit on.
export const SILHOUETTE_HALF =
  "M50 3 C44 3 41 8 41 14 C41 19 43 23 45 25 L45 28 C40 30 33 30 28 32 " +
  "C23 34 21 39 21 46 C20 54 20 60 19 66 C18 76 16 86 15 94 C14 99 15 103 17 104 " +
  "C19 105 21 102 22 98 C24 90 27 80 29 70 C30 64 31 58 32 54 " +
  "C33 62 34 70 35 78 C35 86 34 92 33 98 C31 110 32 124 35 138 C36 144 36 148 36 152 " +
  "C35 162 36 172 38 182 C38 186 35 190 36 193 C39 195 45 195 46 192 " +
  "C46 186 45 182 45 176 C46 166 46 156 46 148 C47 140 48 128 49 116 L50 104 Z";

export const FRONT: BodyShape[] = [
  // Neck / upper traps showing above the collarbone
  { m: "Traps", d: "M45.5 26 C43 28.5 38 30 33 31.5 C37 33 42 33 46 32 L50 31.5 L50 27 Z" },
  // Front + side delt — side-delt work lights the cap too
  {
    m: ["Front Delts", "Side Delts"],
    d: "M32.5 32.5 C26.5 33 22.5 37 22.5 44 C22.5 46.5 24 48 26 47 C28 44 30 40.5 33.5 37.5 C35 36 36.5 34.5 36.5 33.5 Z",
  },
  // Pec — clavicular fan into the sternum
  {
    m: "Pec Major",
    d: "M49.5 33.5 C45 33 40 33.5 37 35 C34 38 32.5 43 33.5 48 C35.5 52 41 53.5 46 52.5 C48 52 49.5 51 49.5 49.5 Z",
  },
  // Serratus fingers under the pec
  { m: "Pec Major", d: "M34 50.5 C33.5 53 34 56 35 58 L37.5 55.5 C36.5 54 35.5 52 35 50 Z" },
  // Biceps
  {
    m: "Biceps",
    d: "M25.5 48.5 C23.5 53 23 58 23.5 63 C24.5 65.5 27.5 65.5 29 63 C30 58.5 30 53.5 29.5 49.5 C28.5 48 27 47.5 25.5 48.5 Z",
  },
  // Forearm
  {
    m: "Forearms",
    d: "M23 66.5 C21 73 19.5 81 18 89 C18.5 91 21 91.5 22.5 90 C25 83 27.5 75 29.5 67.5 C28 65.5 24.5 65.5 23 66.5 Z",
  },
  // Rectus abdominis — three blocks and the lower belly
  { m: "Abs", d: "M49.3 54 L44 54.5 C43 56.5 43 59 43.5 61 L49.3 61 Z" },
  { m: "Abs", d: "M49.3 62.3 L43.6 62.3 C43.2 64.8 43.2 67.2 43.6 69.2 L49.3 69.2 Z" },
  { m: "Abs", d: "M49.3 70.5 L43.8 70.5 C43.4 73 43.4 75.5 43.9 77.5 L49.3 77.5 Z" },
  { m: "Abs", d: "M49.3 78.8 L44 78.8 C44 83 45 87 47 90.5 L49.3 91.5 Z" },
  // Obliques
  {
    m: "Obliques",
    d: "M42.3 55.5 C39.5 57 37.5 60 37.8 64 C38 71 38.5 78 40.5 84 C41.5 87 43 89 45.5 90.5 C43.5 86 42.5 82 42.3 78 Z",
  },
  // Quads — outer sweep and the teardrop above the knee
  {
    m: "Quads",
    d: "M43 96 C38 99 35 107 34.5 117 C34.5 127 36 135 38.5 141 C40.5 143 43 142 44.5 139 C46 131 46.5 121 46.5 111 C46.5 105 46 100 45 97 Z",
  },
  {
    m: "Quads",
    d: "M46.2 128 C44.5 133 44.2 138 45.5 142 C47 143.5 48.6 142 48.8 139 C49 135 48.2 131 46.2 128 Z",
  },
  // Adductors — inner thigh
  { m: "Adductors", d: "M46.5 99 C47.5 105 48.5 112 49.2 119 L49.8 119 L49.8 101 C48.8 100 47.6 99.3 46.5 99 Z" },
  // Tibialis — front of the shin
  {
    m: "Tibialis",
    d: "M39.5 149 C38 156 37.8 165 38.8 174 C39.5 177 41.5 177 42 174.5 C42.8 166 43 157 42.8 150 C41.8 148 40.5 148 39.5 149 Z",
  },
  // Inner calf visible from the front
  {
    m: "Calves",
    d: "M43.8 150 C45.5 156 46 164 45.2 172 L44 174 C43.9 165 43.9 157 43.8 150 Z",
  },
];

export const BACK: BodyShape[] = [
  // Traps — upper fibres to the neck, the long diamond down the spine
  {
    m: "Traps",
    d: "M45.5 25.5 C43 28.5 38 30.5 33 32 C38 33.5 43 35.5 46 39 C47.5 44 48.5 51 49.8 58 L49.8 26 Z",
  },
  // Rear delt
  {
    m: "Rear Delts",
    d: "M32.5 32.5 C26.5 33 22.5 37 22.5 43.5 C22.5 46 24 47.5 26 46.5 C28.5 43.5 31 40 34 37.5 C35 36 35.5 34.5 35 33.5 Z",
  },
  // Rhomboids / teres, between the shoulder blade and the spine
  { m: "Rhomboids", d: "M45.5 38.5 C42 37.5 38.5 38 36 40 C37 43.5 40 46 44 47 L47.5 47 C47 44 46.5 41 45.5 38.5 Z" },
  // Lats — the wing
  {
    m: "Lats",
    d: "M35.5 42 C33 47 32.5 54 34 61 C36 68 40 75 44.5 80.5 L47 78 C47.2 70 47.3 60 47.6 49 C43 49 38.5 46.5 35.5 42 Z",
  },
  // Triceps
  {
    m: "Triceps",
    d: "M25 47.5 C23 53 22.8 58 23.5 63 C24.5 65.5 27.5 65.5 29 63 C30 58 29.8 52.5 29 48 C27.8 46.8 26.3 46.8 25 47.5 Z",
  },
  // Forearm
  {
    m: "Forearms",
    d: "M23 66.5 C21 73 19.5 81 18 89 C18.5 91 21 91.5 22.5 90 C25 83 27.5 75 29.5 67.5 C28 65.5 24.5 65.5 23 66.5 Z",
  },
  // Spinal erectors
  { m: "Lower Back", d: "M49.6 60 L47.8 61 C46.5 68 46 76 46.2 83 C47 86 48.2 88 49.6 89 Z" },
  // Glutes
  {
    m: "Glutes",
    d: "M49.6 91 C45 90 39.5 92 36.5 97 C34.5 102 36 108 40.5 111 C44 113 47.5 112.5 49.6 111 Z",
  },
  // Hamstrings
  {
    m: "Hamstrings",
    d: "M36.5 114 C35 122 35.8 131 38.5 139 C40 142 42.5 142 44 140 C46.2 132 47.5 123 47.8 114.5 C44 115.5 40 115.3 36.5 114 Z",
  },
  // Inner hamstring / adductor sliver
  { m: "Adductors", d: "M48.5 113.5 C48.8 120 48.9 127 48.6 134 L49.8 134 L49.8 113 Z" },
  // Calves — gastrocnemius
  {
    m: "Calves",
    d: "M38.8 147.5 C36.5 153 36.3 160 37.8 166.5 C39 169.5 41.5 169.5 42.8 167 C44.3 161 44.8 154 44.2 148.5 C42.5 146.5 40.3 146.5 38.8 147.5 Z",
  },
];
