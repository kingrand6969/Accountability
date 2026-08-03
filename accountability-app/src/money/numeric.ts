export function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field} received from the server.`);
  }
  return parsed;
}

export function positiveFiniteNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value, field);
  if (parsed <= 0) throw new Error(`${field} must be greater than zero.`);
  return parsed;
}
