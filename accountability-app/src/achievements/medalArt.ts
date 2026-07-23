// Registry + effect tuning for the image-based medals (the PNG medal pack).
// The artwork is used EXACTLY as delivered — never redrawn or recoloured; all
// premium motion is layered over it by <MedalIcon /> (tinted copies, halo,
// sparkles). Effects are tuned per METAL tier first, then refined per icon.

/** 0 Bronze · 1 Silver · 2 Gold · 3 Platinum · 4 Diamond (matches TIER_META). */
export type MedalTierIndex = 0 | 1 | 2 | 3 | 4;

export const MEDAL_ART = {
  'streak-spark': require('../../assets/images/medals/streak-spark.webp'),
  'streak-ember': require('../../assets/images/medals/streak-ember.webp'),
  'streak-blaze': require('../../assets/images/medals/streak-blaze.webp'),
  'streak-inferno': require('../../assets/images/medals/streak-inferno.webp'),
  'streak-eternal': require('../../assets/images/medals/streak-eternal.webp'),
  'distance-10k': require('../../assets/images/medals/distance-10k.webp'),
  'distance-50k': require('../../assets/images/medals/distance-50k.webp'),
  'distance-century': require('../../assets/images/medals/distance-century.webp'),
  'distance-250': require('../../assets/images/medals/distance-250.webp'),
  'distance-500': require('../../assets/images/medals/distance-500.webp'),
  'iron-0': require('../../assets/images/medals/iron-0.webp'),
  'iron-1': require('../../assets/images/medals/iron-1.webp'),
  'iron-2': require('../../assets/images/medals/iron-2.webp'),
  'iron-3': require('../../assets/images/medals/iron-3.webp'),
  'iron-4': require('../../assets/images/medals/iron-4.webp'),
  'competitor-0': require('../../assets/images/medals/competitor-0.webp'),
  'competitor-1': require('../../assets/images/medals/competitor-1.webp'),
  'competitor-2': require('../../assets/images/medals/competitor-2.webp'),
  'competitor-3': require('../../assets/images/medals/competitor-3.webp'),
  'competitor-4': require('../../assets/images/medals/competitor-4.webp'),
  'squad-0': require('../../assets/images/medals/squad-0.webp'),
  'squad-1': require('../../assets/images/medals/squad-1.webp'),
  'squad-2': require('../../assets/images/medals/squad-2.webp'),
  'squad-3': require('../../assets/images/medals/squad-3.webp'),
  'squad-4': require('../../assets/images/medals/squad-4.webp'),
  'trailblazer-0': require('../../assets/images/medals/trailblazer-0.webp'),
  'trailblazer-1': require('../../assets/images/medals/trailblazer-1.webp'),
  'trailblazer-2': require('../../assets/images/medals/trailblazer-2.webp'),
  'trailblazer-3': require('../../assets/images/medals/trailblazer-3.webp'),
  'trailblazer-4': require('../../assets/images/medals/trailblazer-4.webp'),
  'longhaul-0': require('../../assets/images/medals/longhaul-0.webp'),
  'longhaul-1': require('../../assets/images/medals/longhaul-1.webp'),
  'longhaul-2': require('../../assets/images/medals/longhaul-2.webp'),
  'longhaul-3': require('../../assets/images/medals/longhaul-3.webp'),
  'longhaul-4': require('../../assets/images/medals/longhaul-4.webp'),
  'devotion-0': require('../../assets/images/medals/devotion-0.webp'),
  'devotion-1': require('../../assets/images/medals/devotion-1.webp'),
  'devotion-2': require('../../assets/images/medals/devotion-2.webp'),
  'devotion-3': require('../../assets/images/medals/devotion-3.webp'),
  'devotion-4': require('../../assets/images/medals/devotion-4.webp'),
  'champion-0': require('../../assets/images/medals/champion-0.webp'),
  'champion-1': require('../../assets/images/medals/champion-1.webp'),
  'champion-2': require('../../assets/images/medals/champion-2.webp'),
  'champion-3': require('../../assets/images/medals/champion-3.webp'),
  'champion-4': require('../../assets/images/medals/champion-4.webp'),
  'archivist-0': require('../../assets/images/medals/archivist-0.webp'),
  'archivist-1': require('../../assets/images/medals/archivist-1.webp'),
  'archivist-2': require('../../assets/images/medals/archivist-2.webp'),
  'archivist-3': require('../../assets/images/medals/archivist-3.webp'),
  'archivist-4': require('../../assets/images/medals/archivist-4.webp'),
  'goalcrusher-0': require('../../assets/images/medals/goalcrusher-0.webp'),
  'goalcrusher-1': require('../../assets/images/medals/goalcrusher-1.webp'),
  'goalcrusher-2': require('../../assets/images/medals/goalcrusher-2.webp'),
  'goalcrusher-3': require('../../assets/images/medals/goalcrusher-3.webp'),
  'goalcrusher-4': require('../../assets/images/medals/goalcrusher-4.webp'),
  'endurance-0': require('../../assets/images/medals/endurance-0.webp'),
  'endurance-1': require('../../assets/images/medals/endurance-1.webp'),
  'endurance-2': require('../../assets/images/medals/endurance-2.webp'),
  'endurance-3': require('../../assets/images/medals/endurance-3.webp'),
  'endurance-4': require('../../assets/images/medals/endurance-4.webp'),
  'explorer-0': require('../../assets/images/medals/explorer-0.webp'),
  'explorer-1': require('../../assets/images/medals/explorer-1.webp'),
  'explorer-2': require('../../assets/images/medals/explorer-2.webp'),
  'ambassador-0': require('../../assets/images/medals/ambassador-0.webp'),
  'ambassador-1': require('../../assets/images/medals/ambassador-1.webp'),
  'ambassador-2': require('../../assets/images/medals/ambassador-2.webp'),
} as const;

export type MedalIconKey = keyof typeof MEDAL_ART;

/** The metal each icon is painted in. For most families the tier index IS the
 *  metal; Ambassador starts at Gold (catalog startTier 2). */
export const MEDAL_TIER: Record<MedalIconKey, MedalTierIndex> = (() => {
  const map = {} as Record<MedalIconKey, MedalTierIndex>;
  (Object.keys(MEDAL_ART) as MedalIconKey[]).forEach((key) => {
    const named: Record<string, MedalTierIndex> = {
      'streak-spark': 0, 'streak-ember': 1, 'streak-blaze': 2, 'streak-inferno': 3, 'streak-eternal': 4,
      'distance-10k': 0, 'distance-50k': 1, 'distance-century': 2, 'distance-250': 3, 'distance-500': 4,
    };
    if (key in named) { map[key] = named[key]; return; }
    const idx = Number(key.split('-')[1]) as MedalTierIndex;
    map[key] = key.startsWith('ambassador') ? (Math.min(2 + idx, 4) as MedalTierIndex) : idx;
  });
  return map;
})();

const FAMILIES: Record<string, MedalIconKey[]> = {
  streak: ['streak-spark', 'streak-ember', 'streak-blaze', 'streak-inferno', 'streak-eternal'],
  distance: ['distance-10k', 'distance-50k', 'distance-century', 'distance-250', 'distance-500'],
  iron: ['iron-0', 'iron-1', 'iron-2', 'iron-3', 'iron-4'],
  competitor: ['competitor-0', 'competitor-1', 'competitor-2', 'competitor-3', 'competitor-4'],
  squad: ['squad-0', 'squad-1', 'squad-2', 'squad-3', 'squad-4'],
  trailblazer: ['trailblazer-0', 'trailblazer-1', 'trailblazer-2', 'trailblazer-3', 'trailblazer-4'],
  longhaul: ['longhaul-0', 'longhaul-1', 'longhaul-2', 'longhaul-3', 'longhaul-4'],
  devotion: ['devotion-0', 'devotion-1', 'devotion-2', 'devotion-3', 'devotion-4'],
  champion: ['champion-0', 'champion-1', 'champion-2', 'champion-3', 'champion-4'],
  archivist: ['archivist-0', 'archivist-1', 'archivist-2', 'archivist-3', 'archivist-4'],
  goalcrusher: ['goalcrusher-0', 'goalcrusher-1', 'goalcrusher-2', 'goalcrusher-3', 'goalcrusher-4'],
  endurance: ['endurance-0', 'endurance-1', 'endurance-2', 'endurance-3', 'endurance-4'],
  explorer: ['explorer-0', 'explorer-1', 'explorer-2'],
  ambassador: ['ambassador-0', 'ambassador-1', 'ambassador-2'],
};

/** The artwork key for a catalog medal at a tier — null when a medal family
 *  has no artwork yet (it falls back to the drawn coin). */
export function medalArtFor(defId: string, tierIndex: number): MedalIconKey | null {
  return FAMILIES[defId]?.[tierIndex] ?? null;
}

// ── effect tuning ────────────────────────────────────────────────────────────

export type MedalFx = {
  /** soft pulsing aura behind the art */
  halo: { color: string; max: number; scaleTo: number; ms: number };
  /** tinted copies of the art breathing over it (heat / shimmer, shape-exact) */
  embers: { color: string; max: number; ms: number; delay?: number }[];
  /** brief white shine pass over the whole artwork */
  glint: { bright: number; everyMs: number; double?: boolean };
  /** tiny twinkling motes */
  sparkles: { count: number; color: string; slow?: boolean };
  /** one soft rising puff behind the flame tip (spark only) */
  drift?: { color: string; max: number };
  /** a small light orbiting the medal (500 Club's globe) */
  orbit?: { color: string; ms: number };
};

const TIER_FX: Record<MedalTierIndex, MedalFx> = {
  0: {
    // Bronze — warm ember pulse, gentle inner glow, occasional spark blink
    halo: { color: '#E89A55', max: 0.18, scaleTo: 1.1, ms: 2600 },
    embers: [{ color: '#FF9D5C', max: 0.14, ms: 2400 }],
    glint: { bright: 0.1, everyMs: 6500 },
    sparkles: { count: 1, color: '#FFD9A8', slow: true },
  },
  1: {
    // Silver — soft reflective sheen sweep, cool metallic shimmer
    halo: { color: '#C2CCD6', max: 0.16, scaleTo: 1.1, ms: 3000 },
    embers: [{ color: '#DFE9F2', max: 0.1, ms: 3200 }],
    glint: { bright: 0.22, everyMs: 4600 },
    sparkles: { count: 0, color: '#FFFFFF' },
  },
  2: {
    // Gold — brighter shine pass, prestige glint, soft radiant pulse
    halo: { color: '#FFC94D', max: 0.22, scaleTo: 1.14, ms: 2400 },
    embers: [{ color: '#FFE08A', max: 0.12, ms: 2800 }],
    glint: { bright: 0.28, everyMs: 3800 },
    sparkles: { count: 1, color: '#FFF3C4' },
  },
  3: {
    // Platinum — cool aura pulse, elegant edge shimmer, layered depth glow
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.16, ms: 3200 },
    embers: [
      { color: '#BFEFF7', max: 0.12, ms: 3000 },
      { color: '#FFFFFF', max: 0.08, ms: 3000, delay: 1500 },
    ],
    glint: { bright: 0.18, everyMs: 5200 },
    sparkles: { count: 1, color: '#E6FBFF' },
  },
  4: {
    // Diamond — crystalline twinkle, prism shimmer, tiny magical particles
    halo: { color: '#AEB9FF', max: 0.22, scaleTo: 1.18, ms: 2800 },
    embers: [{ color: '#D9E2FF', max: 0.12, ms: 3400 }],
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 3, color: '#FFFFFF' },
  },
};

/** Per-icon refinements over the tier base (the art direction per icon). */
const ICON_FX: Partial<Record<MedalIconKey, Partial<MedalFx>>> = {
  'streak-spark': {
    // faint ember flicker + a wisp of drifting smoke
    embers: [{ color: '#FF9D5C', max: 0.16, ms: 1800 }],
    drift: { color: '#FFB37A', max: 0.12 },
  },
  'streak-ember': {
    // core glow breathing, slow crack-glow pulse
    embers: [{ color: '#CFE4F5', max: 0.13, ms: 3800 }],
  },
  'streak-blaze': {
    // steady flame light sweep + gold heat shimmer
    glint: { bright: 0.28, everyMs: 3200 },
    embers: [{ color: '#FFD873', max: 0.13, ms: 2400 }],
  },
  // streak-inferno: the platinum two-layer glow IS the "wave through the tips"
  'streak-eternal': {
    // blue-white halo + frost-light sparkles
    halo: { color: '#CFE0FF', max: 0.24, scaleTo: 1.18, ms: 2800 },
  },
  'distance-10k': {
    // soft bronze glow pulse only — calm and grounded
    glint: { bright: 0.08, everyMs: 7000 },
    sparkles: { count: 0, color: '#FFD9A8' },
  },
  'distance-50k': {
    // shimmer traveling along the path
    glint: { bright: 0.24, everyMs: 4200 },
  },
  'distance-century': {
    // gold milestone gleam + highlight sweep
    glint: { bright: 0.32, everyMs: 3600 },
  },
  'distance-250': {
    // horizon light pulse moving forward
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.2, ms: 4000 },
  },
  'distance-500': {
    // globe orbit glow sweep + crystal sparkle
    orbit: { color: '#BFD1FF', ms: 5200 },
    sparkles: { count: 2, color: '#FFFFFF' },
  },
  'explorer-2': {
    // the golden globe gets its own slow orbiting light
    orbit: { color: '#FFE9B0', ms: 6000 },
  },
  'iron-4': {
    // Titan: majestic upward light pulse from the crystal base
    halo: { color: '#CFE0FF', max: 0.24, scaleTo: 1.22, ms: 3000 },
  },
  'competitor-4': {
    // Legend: starburst aura bloom around the crystal star medal
    halo: { color: '#BFD1FF', max: 0.26, scaleTo: 1.22, ms: 2600 },
  },
  'squad-4': {
    // Team: clockwise light ripple around the top-down huddle circle
    orbit: { color: '#CFE0FF', ms: 7000 },
  },
  'trailblazer-3': {
    // Trailblazer: restrained platinum glow rising toward the summit
    halo: { color: '#BFEFF7', max: 0.22, scaleTo: 1.2, ms: 3400 },
  },
  'trailblazer-4': {
    // Nomad: a bright point travelling the globe's dotted route
    orbit: { color: '#DCE8FF', ms: 6200 },
    sparkles: { count: 2, color: '#FFFFFF' },
  },

  // ── Long Haul: longest single distance (roadside marker → arch → summit) ────
  'longhaul-0': {
    // 5K Bronze — warm bronze sheen with a LONG pause, one soft "5K" glint
    embers: [{ color: '#F0A85F', max: 0.14, ms: 2600 }],
    glint: { bright: 0.16, everyMs: 7200 },
  },
  'longhaul-1': {
    // 10K Silver — cool reflection travelling farther, restrained edge shimmer
    embers: [{ color: '#DFE9F2', max: 0.11, ms: 3000 }],
    glint: { bright: 0.24, everyMs: 5200 },
  },
  'longhaul-2': {
    // Half Gold — rich highlight across the 21K arch, brief prestige glint
    glint: { bright: 0.32, everyMs: 4000 },
    embers: [{ color: '#FFE08A', max: 0.13, ms: 2800 }],
  },
  'longhaul-3': {
    // Marathon Platinum — cool platinum light + a restrained icy edge pulse
    halo: { color: '#BFEFF7', max: 0.2, scaleTo: 1.16, ms: 3400 },
    embers: [
      { color: '#CFF3FA', max: 0.12, ms: 3000 },
      { color: '#FFFFFF', max: 0.08, ms: 3000, delay: 1500 },
    ],
    glint: { bright: 0.2, everyMs: 5200 },
  },
  'longhaul-4': {
    // Ultra Diamond — blue-white light climbing the trail to a summit flash,
    // occasional prism sparkles (a few controlled particles)
    halo: { color: '#AEB9FF', max: 0.22, scaleTo: 1.2, ms: 3000 },
    orbit: { color: '#DCE8FF', ms: 6400 },
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 2, color: '#FFFFFF' },
  },

  // ── Devotion: total active days (calendar bronze → flame → infinity) ────────
  'devotion-0': {
    // Starter Bronze — gentle warm calendar pulse + subtle bronze sheen
    halo: { color: '#E89A55', max: 0.18, scaleTo: 1.11, ms: 3000 },
    glint: { bright: 0.14, everyMs: 6000 },
  },
  'devotion-1': {
    // Steady Silver — reflection sweeps the surface; calendar stays STILL
    halo: { color: '#C2CCD6', max: 0.14, scaleTo: 1.06, ms: 3200 },
    glint: { bright: 0.24, everyMs: 4600 },
  },
  'devotion-2': {
    // Devoted Gold — slow heart pulse + warm prestige sweep + a small glint
    halo: { color: '#FFC94D', max: 0.22, scaleTo: 1.14, ms: 2600 },
    glint: { bright: 0.3, everyMs: 3800 },
    sparkles: { count: 1, color: '#FFF3C4' },
  },
  'devotion-3': {
    // Relentless Platinum — restrained flame flicker (warm ember over the cool
    // tier glow) + a platinum edge shimmer spreading into the calendar
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.16, ms: 3200 },
    embers: [
      { color: '#FFB27A', max: 0.14, ms: 1900 },
      { color: '#CFF3FA', max: 0.1, ms: 3000, delay: 1400 },
    ],
    glint: { bright: 0.18, everyMs: 5200 },
  },
  'devotion-4': {
    // Unstoppable Diamond — a blue-white light continuously travels the infinity
    // path; the centre crystal throws the occasional prism glint; tiny particles
    orbit: { color: '#CFE0FF', ms: 5600 },
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 3, color: '#FFFFFF' },
  },

  // ── Champion: challenges won (rosette → medals → fist → podium → cup) ───────
  'champion-0': {
    // Winner Bronze — warm sheen across the rosette + one brief trophy glint
    embers: [{ color: '#F0A85F', max: 0.14, ms: 2600 }],
    glint: { bright: 0.16, everyMs: 6800 },
  },
  'champion-1': {
    // Rival Silver — cool glint across the two medals + a light pulse at the cross
    halo: { color: '#C2CCD6', max: 0.15, scaleTo: 1.08, ms: 3000 },
    glint: { bright: 0.24, everyMs: 4600 },
  },
  'champion-2': {
    // Victor Gold — warm gold light rising through the fist + a prestige glint
    halo: { color: '#FFC94D', max: 0.22, scaleTo: 1.14, ms: 2500 },
    glint: { bright: 0.3, everyMs: 3800 },
    sparkles: { count: 1, color: '#FFF3C4' },
  },
  'champion-3': {
    // Dominator Platinum — cool sweep along the podium + a restrained icy aura
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.16, ms: 3200 },
    embers: [{ color: '#CFF3FA', max: 0.11, ms: 3000 }],
    glint: { bright: 0.2, everyMs: 5000 },
  },
  'champion-4': {
    // Champion Diamond — crystal refraction across the cup + a few blue-white motes
    halo: { color: '#AEB9FF', max: 0.22, scaleTo: 1.18, ms: 2800 },
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 3, color: '#FFFFFF' },
  },

  // ── Archivist: memories saved (photo → stack → album → box → vault) ─────────
  'archivist-0': {
    // First Frame Bronze — soft bronze "camera-flash" glow + a corner highlight
    halo: { color: '#E89A55', max: 0.18, scaleTo: 1.1, ms: 3000 },
    glint: { bright: 0.2, everyMs: 6000 },
  },
  'archivist-1': {
    // Album Silver — silver sheen through the photo stack + restrained edge glints
    embers: [{ color: '#DFE9F2', max: 0.11, ms: 3200 }],
    glint: { bright: 0.24, everyMs: 4800 },
  },
  'archivist-2': {
    // Collection Gold — gold shine across the album + a gentle emblem pulse
    halo: { color: '#FFC94D', max: 0.2, scaleTo: 1.12, ms: 2600 },
    glint: { bright: 0.3, everyMs: 3800 },
  },
  'archivist-3': {
    // Archive Platinum — platinum light over the box + a cool inner glow
    halo: { color: '#BFEFF7', max: 0.2, scaleTo: 1.14, ms: 3200 },
    embers: [{ color: '#CFF3FA', max: 0.12, ms: 3000 }],
    glint: { bright: 0.2, everyMs: 5200 },
  },
  'archivist-4': {
    // Vault Diamond — blue-white light travels the vault ring; bolts sparkle; motes
    orbit: { color: '#CFE0FF', ms: 5800 },
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 3, color: '#FFFFFF' },
  },

  // ── Goal Crusher: savings goals reached (flag → stacks → bullseye → bank → chest)
  'goalcrusher-0': {
    // Finisher Bronze — bronze sheen across the flag + a glint at the pole
    embers: [{ color: '#F0A85F', max: 0.14, ms: 2600 }],
    glint: { bright: 0.16, everyMs: 6800 },
  },
  'goalcrusher-1': {
    // On a Roll Silver — sheen rising through the coin stacks + completion shimmer
    embers: [{ color: '#DFE9F2', max: 0.11, ms: 3200 }],
    glint: { bright: 0.24, everyMs: 4600 },
  },
  'goalcrusher-2': {
    // Closer Gold — a gold pulse contracting to the bullseye + a prestige glint
    halo: { color: '#FFC94D', max: 0.22, scaleTo: 1.1, ms: 2400 },
    glint: { bright: 0.3, everyMs: 3800 },
    sparkles: { count: 1, color: '#FFF3C4' },
  },
  'goalcrusher-3': {
    // Machine Platinum — platinum light through the bank + restrained fullness glow
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.14, ms: 3200 },
    embers: [{ color: '#CFF3FA', max: 0.11, ms: 3000 }],
    glint: { bright: 0.2, everyMs: 5000 },
  },
  'goalcrusher-4': {
    // Legend Diamond — blue-white light around the chest + a lock-gem prism flare
    halo: { color: '#AEB9FF', max: 0.22, scaleTo: 1.18, ms: 2800 },
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 3, color: '#FFFFFF' },
  },

  // ── Endurance: total moving hours (stopwatch → heartbeat → gears → shield → hourglass)
  'endurance-0': {
    // Warmup Bronze — bronze sheen across the case + a start-click glint
    embers: [{ color: '#F0A85F', max: 0.13, ms: 2600 }],
    glint: { bright: 0.16, everyMs: 6600 },
  },
  'endurance-1': {
    // Grinder Silver — a heartbeat light travels once + a silver reflection sweep
    halo: { color: '#C2CCD6', max: 0.14, scaleTo: 1.06, ms: 3000 },
    glint: { bright: 0.24, everyMs: 4400 },
  },
  'endurance-2': {
    // Machine Gold — slow gear glow + a mechanical pulse + one rim highlight
    halo: { color: '#FFC94D', max: 0.2, scaleTo: 1.12, ms: 2600 },
    embers: [{ color: '#FFE08A', max: 0.12, ms: 2800 }],
    glint: { bright: 0.28, everyMs: 3800 },
  },
  'endurance-3': {
    // Ironclad Platinum — platinum light tracing the shield + a defensive pulse
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.16, ms: 3200 },
    embers: [{ color: '#CFF3FA', max: 0.11, ms: 3000 }],
    glint: { bright: 0.2, everyMs: 5200 },
  },
  'endurance-4': {
    // Relentless Diamond — light travels the hourglass; the bolt pulses; rare sparkles
    orbit: { color: '#CFE0FF', ms: 6000 },
    glint: { bright: 0.26, everyMs: 4400, double: true },
    sparkles: { count: 2, color: '#FFFFFF', slow: true },
  },

  // ── Explorer: places logged (pin → pin+camera → globe). Bronze → Gold ──────
  //   (explorer-2 already tuned above with an orbit; kept there.)
  'explorer-0': {
    // Wanderer Bronze — bronze sheen across the pin + a restrained location pulse
    halo: { color: '#E89A55', max: 0.18, scaleTo: 1.12, ms: 2800 },
    glint: { bright: 0.16, everyMs: 6600 },
  },
  'explorer-1': {
    // Tourist Silver — silver sheen + a single camera-flash glint, long pause
    embers: [{ color: '#DFE9F2', max: 0.11, ms: 3200 }],
    glint: { bright: 0.26, everyMs: 5200 },
  },

  // ── Ambassador: friends invited (megaphone → network → crown). Gold → Diamond
  'ambassador-0': {
    // Ambassador Gold — gold sheen across the megaphone + a join-confirm pulse
    halo: { color: '#FFC94D', max: 0.22, scaleTo: 1.14, ms: 2500 },
    glint: { bright: 0.3, everyMs: 3800 },
    sparkles: { count: 1, color: '#FFF3C4' },
  },
  'ambassador-1': {
    // Connector Platinum — light travels the network links + a coordinated pulse
    halo: { color: '#7FD6E3', max: 0.2, scaleTo: 1.16, ms: 3200 },
    embers: [{ color: '#CFF3FA', max: 0.11, ms: 3000 }],
    glint: { bright: 0.2, everyMs: 5000 },
  },
  'ambassador-2': {
    // Kingmaker Diamond — light travels toward the crown; gems throw prism sparkles
    orbit: { color: '#CFE0FF', ms: 6200 },
    glint: { bright: 0.26, everyMs: 4200, double: true },
    sparkles: { count: 3, color: '#FFFFFF' },
  },
};

export function medalFx(icon: MedalIconKey, tier?: MedalTierIndex): MedalFx {
  const base = TIER_FX[tier ?? MEDAL_TIER[icon]];
  return { ...base, ...(ICON_FX[icon] ?? {}) };
}
