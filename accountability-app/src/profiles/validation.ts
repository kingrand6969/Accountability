/** Whole years old today for a YYYY-MM-DD birthday, or null if unparseable. */
export function ageFromBirthday(value: string): number | null {
  if (validateBirthday(value) || !value.trim()) return null;
  const [y, m, d] = value.trim().split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  const reached = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
  if (!reached) age -= 1;
  return age;
}

export function validateBirthday(value: string): string | null {
  const v = value.trim();
  if (!v) return null; // optional
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Use the format YYYY-MM-DD.';
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  if (!valid) return 'That date is not valid.';
  return null;
}
