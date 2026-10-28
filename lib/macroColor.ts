// Macros' own colour, "Fire": hot orange burning into deep red, the flame
// icon's colours. Gauges, bars and big numbers run the gradient (red at the
// start, orange at the tip); glows and small accents use the solid.
export const MACRO_FROM = "#dc2626";
export const MACRO_TO = "#fdba74";
export const MACRO = "#f4623a";
/// MACRO as "r, g, b", for rgba() washes.
export const MACRO_RGB = "244, 98, 58";
/// Text on a MACRO-tinted chip.
export const MACRO_INK = "#fed7aa";
export const MACRO_GRADIENT = `linear-gradient(90deg, ${MACRO_FROM}, ${MACRO_TO})`;
