import type { ImageSourcePropType } from 'react-native';

/**
 * The 10 rank tiers, in order. Each maps to its EXACT badge artwork (untouched)
 * plus a per-rank animation recipe layered on top by <RankBadge/>. Every rank
 * gets a distinct feel via its glow colour + how strong/how fast the overlays run.
 */
export type RankName =
  | 'Rookie'
  | 'Regular'
  | 'Committed'
  | 'Dedicated'
  | 'Proven'
  | 'Elite'
  | 'Master'
  | 'Apex'
  | 'Legend'
  | 'Mythical';

export type RankConfig = {
  image: ImageSourcePropType;
  glow: string; // aura / glow colour, sampled from the badge
  glowMax: number; // peak glow opacity (0–1)
  shineMs: number; // shine-sweep duration
  shineBright: number; // peak shine opacity
  shineDir: 'diag' | 'up'; // sweep direction — 'up' reads as a rising shimmer
  sparkles: number; // number of twinkling motes (0 = none)
  flicker: boolean; // crystal flicker on the badge itself
  feel: string; // one-line description of the intended feel
};

export const RANK_ORDER: RankName[] = [
  'Rookie', 'Regular', 'Committed', 'Dedicated', 'Proven',
  'Elite', 'Master', 'Apex', 'Legend', 'Mythical',
];

export const RANK_CONFIG: Record<RankName, RankConfig> = {
  Rookie: {
    image: require('../../assets/images/ranks/rookie.png'),
    glow: '#8b97ab', glowMax: 0.18, shineMs: 4200, shineBright: 0.42, shineDir: 'diag',
    sparkles: 0, flicker: false, feel: 'soft metallic shine',
  },
  Regular: {
    image: require('../../assets/images/ranks/regular.png'),
    glow: '#3b82f6', glowMax: 0.26, shineMs: 3600, shineBright: 0.55, shineDir: 'diag',
    sparkles: 0, flicker: false, feel: 'blue sheen sweep',
  },
  Committed: {
    image: require('../../assets/images/ranks/committed.png'),
    glow: '#22c55e', glowMax: 0.24, shineMs: 2600, shineBright: 0.8, shineDir: 'diag',
    sparkles: 0, flicker: false, feel: 'checkmark glint',
  },
  Dedicated: {
    image: require('../../assets/images/ranks/dedicated.png'),
    glow: '#14b8a6', glowMax: 0.27, shineMs: 3400, shineBright: 0.5, shineDir: 'up',
    sparkles: 0, flicker: false, feel: 'upward chevron shimmer',
  },
  Proven: {
    image: require('../../assets/images/ranks/proven.png'),
    glow: '#ef4444', glowMax: 0.4, shineMs: 4000, shineBright: 0.45, shineDir: 'diag',
    sparkles: 0, flicker: false, feel: 'ruby gleam',
  },
  Elite: {
    image: require('../../assets/images/ranks/elite.png'),
    glow: '#8b5cf6', glowMax: 0.5, shineMs: 5000, shineBright: 0.35, shineDir: 'diag',
    sparkles: 0, flicker: false, feel: 'violet aura pulse',
  },
  Master: {
    image: require('../../assets/images/ranks/master.png'),
    glow: '#d4af37', glowMax: 0.38, shineMs: 3800, shineBright: 0.6, shineDir: 'diag',
    sparkles: 2, flicker: false, feel: 'laurel shimmer',
  },
  Apex: {
    image: require('../../assets/images/ranks/apex.png'),
    glow: '#67e8f9', glowMax: 0.34, shineMs: 3000, shineBright: 0.65, shineDir: 'diag',
    sparkles: 2, flicker: true, feel: 'icy crystal flicker',
  },
  Legend: {
    image: require('../../assets/images/ranks/legend.png'),
    glow: '#f5c542', glowMax: 0.5, shineMs: 3400, shineBright: 0.65, shineDir: 'diag',
    sparkles: 4, flicker: false, feel: 'golden radiant sparkles',
  },
  Mythical: {
    image: require('../../assets/images/ranks/mythical.png'),
    glow: '#b98cff', glowMax: 0.6, shineMs: 3000, shineBright: 0.55, shineDir: 'diag',
    sparkles: 5, flicker: false, feel: 'iridescent cosmic shimmer with particles',
  },
};

export function rankConfig(name: string): RankConfig {
  return RANK_CONFIG[name as RankName] ?? RANK_CONFIG.Rookie;
}
