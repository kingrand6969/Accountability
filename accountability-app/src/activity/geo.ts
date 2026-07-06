export type Pt = { lat: number; lon: number };

/** Great-circle distance between two points, in metres. */
export function haversineMeters(a: Pt, b: Pt): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function totalDistanceMeters(points: Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineMeters(points[i - 1], points[i]);
  return d;
}

/** Pace in minutes per km, or null if distance is too small to be meaningful. */
export function paceMinPerKm(distanceM: number, durationS: number): number | null {
  if (distanceM < 1) return null;
  return durationS / 60 / (distanceM / 1000);
}

export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatKm(distanceM: number): string {
  return (distanceM / 1000).toFixed(2);
}

/** Human duration for the run card: "1h 31m", "31m", "45s". */
export function formatDurationLong(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatPace(distanceM: number, durationS: number): string {
  const p = paceMinPerKm(distanceM, durationS);
  if (p == null || !Number.isFinite(p)) return '--:--';
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Rough calorie ESTIMATE from distance + activity type. Per-km rates assume a
 * ~68 kg adult (we don't collect weight); always show it labelled "est".
 * Never presented as a medical/accurate figure.
 */
const KCAL_PER_KM: Record<'run' | 'walk' | 'ride', number> = {
  run: 65,
  walk: 34,
  ride: 19,
};

export function estimateCalories(type: 'run' | 'walk' | 'ride', distanceM: number): number {
  return Math.round((distanceM / 1000) * (KCAL_PER_KM[type] ?? 45));
}
