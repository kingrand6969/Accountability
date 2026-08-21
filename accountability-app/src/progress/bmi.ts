const INVALID_MEASUREMENT_MESSAGE = 'Enter valid weight and height values.';

export function assertValidBodyValues(weightKg: number, heightCm: number): void {
  if (
    !Number.isFinite(weightKg) ||
    weightKg < 20 ||
    weightKg > 500 ||
    !Number.isFinite(heightCm) ||
    heightCm < 80 ||
    heightCm > 250
  ) {
    throw new Error(INVALID_MEASUREMENT_MESSAGE);
  }
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  assertValidBodyValues(weightKg, heightCm);
  const heightMetres = heightCm / 100;
  return Math.round((weightKg / heightMetres ** 2) * 10) / 10;
}
