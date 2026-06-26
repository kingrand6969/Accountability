import { toLocalDateString } from '../timeline/datetime';
import type { TimelineType } from '../timeline/types';

export type VoiceParseResult = {
  title: string;
  type: TimelineType;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  remind: boolean;
};

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function detectType(lower: string): TimelineType {
  if (/\b(workout|gym|exercise|train|lift)\b/.test(lower)) return 'workout';
  if (/\b(run|jog|walk|ride|cycle|bike)\b/.test(lower)) return 'activity';
  if (/\b(eat|meal|breakfast|lunch|dinner|snack)\b/.test(lower)) return 'meal';
  if (/\b(pay|spend|budget|bill)\b/.test(lower)) return 'expense';
  if (/\b(meeting|appointment|event|call)\b/.test(lower)) return 'event';
  return 'task';
}

function detectDate(lower: string, now: Date): Date {
  const d = new Date(now);
  if (/\btomorrow\b/.test(lower)) {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(lower)) {
    return d;
  }
  const wd = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(lower));
  if (wd >= 0) {
    let add = (wd - d.getDay() + 7) % 7;
    if (add === 0) add = 7; // "monday" means the next monday
    d.setDate(d.getDate() + add);
  }
  return d;
}

function detectTime(lower: string): { hh: number; mm: number } {
  const ampm = lower.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let hh = parseInt(ampm[1], 10);
    const mm = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (ampm[3] === 'pm' && hh < 12) hh += 12;
    if (ampm[3] === 'am' && hh === 12) hh = 0;
    return { hh, mm };
  }
  const h24 = lower.match(/\bat\s*(\d{1,2}):(\d{2})\b/);
  if (h24) return { hh: parseInt(h24[1], 10), mm: parseInt(h24[2], 10) };
  if (/\bnoon\b/.test(lower)) return { hh: 12, mm: 0 };
  if (/\bmidnight\b/.test(lower)) return { hh: 0, mm: 0 };
  if (/\bmorning\b/.test(lower)) return { hh: 9, mm: 0 };
  if (/\bafternoon\b/.test(lower)) return { hh: 14, mm: 0 };
  if (/\b(evening|tonight)\b/.test(lower)) return { hh: 19, mm: 0 };
  return { hh: 9, mm: 0 }; // default
}

function cleanTitle(input: string): string {
  let title = input
    .replace(/\bremind me to\b/gi, '')
    .replace(/\bremind me\b/gi, '')
    .replace(/\bremind\b/gi, '')
    .replace(/\bdon'?t forget to\b/gi, '')
    .replace(/\bdon'?t forget\b/gi, '')
    .replace(/\bset (an )?alarm( to| for)?\b/gi, '')
    .replace(
      /\b(today|tonight|tomorrow|this morning|this afternoon|this evening|next)\b/gi,
      '',
    )
    .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\bat\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\b(noon|midnight|morning|afternoon|evening)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  title = title.replace(/^to\s+/i, '').trim();
  if (!title) title = input.trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Turns a natural-language phrase (typed or dictated) into a structured
 * timeline item the Add form can pre-fill. Examples:
 *   "remind me to buy medicine tomorrow at 5pm"
 *   "gym monday at 6am"
 *   "dinner with mom tonight"
 */
export function parseVoiceCommand(
  input: string,
  now: Date = new Date(),
): VoiceParseResult {
  const lower = input.toLowerCase();
  const remind = /\bremind\b|\balarm\b|\bdon'?t forget\b/.test(lower);
  const type = detectType(lower);
  const date = detectDate(lower, now);
  const { hh, mm } = detectTime(lower);
  return {
    title: cleanTitle(input),
    type,
    date: toLocalDateString(date),
    time: `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`,
    remind,
  };
}
