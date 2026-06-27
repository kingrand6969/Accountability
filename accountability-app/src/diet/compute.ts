/** Scale a per-100g value to the given grams, rounded to a whole number. */
export function scaleNutrient(per100: number, grams: number): number {
  if (!Number.isFinite(per100) || !Number.isFinite(grams)) return 0;
  return Math.round((per100 * grams) / 100);
}

/** Scale a per-100g macro to grams, keeping one decimal. */
export function scaleMacro(per100: number, grams: number): number {
  if (!Number.isFinite(per100) || !Number.isFinite(grams)) return 0;
  return Math.round((per100 * grams) / 10) / 10;
}
