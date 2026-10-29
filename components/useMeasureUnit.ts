"use client";

import { useSyncExternalStore } from "react";
import { MEASURE_UNIT_KEY, type LengthUnit } from "@/lib/measureDisplay";

function read(): LengthUnit {
  try {
    return localStorage.getItem(MEASURE_UNIT_KEY) === "cm" ? "cm" : "in";
  } catch {
    // Private mode or blocked storage: inches it is.
    return "in";
  }
}

// The profile form writes the choice and the next page load reads it; nothing
// needs to hear about a change mid-page.
const subscribe = () => () => {};

/// The in/cm choice made on the profile form. Inches on the server, so the
/// first client render agrees with it before storage is read.
export function useMeasureUnit(): LengthUnit {
  return useSyncExternalStore(subscribe, read, () => "in");
}
