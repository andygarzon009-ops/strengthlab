// Macros' own colour, "Fire": mostly red, warming to orange at the tip like
// the flame icon. Gauges, bars and big numbers run the gradient (red at the
// start, orange at the tip); glows and small accents use the solid.
export const MACRO_FROM = "#dc2626";
export const MACRO_TO = "#fb7a3c";
export const MACRO = "#ef4444";
/// MACRO as "r, g, b", for rgba() washes.
export const MACRO_RGB = "239, 68, 68";
/// Text on a MACRO-tinted chip.
export const MACRO_INK = "#fecaca";
export const MACRO_GRADIENT = `linear-gradient(90deg, ${MACRO_FROM}, ${MACRO_FROM} 35%, ${MACRO_TO})`;
