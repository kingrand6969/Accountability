export type ConfettiGeometry = {
  angle: number;
  dist: number;
  delay: number;
  duration: number;
  rot: number;
  w: number;
  h: number;
};

export function createConfettiGeometry(
  count: number,
  random: () => number,
): ConfettiGeometry[] {
  return Array.from({ length: count }, (_, index) => ({
    angle: (index / count) * Math.PI * 2 + random() * 0.5,
    dist: 90 + random() * 130,
    delay: random() * 120,
    duration: 850 + random() * 500,
    rot: (random() - 0.5) * 900,
    w: 6 + random() * 7,
    h: 4 + random() * 6,
  }));
}
