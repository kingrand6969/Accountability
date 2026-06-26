import { describe, it, expect } from '@jest/globals';
import { parseVoiceCommand } from './parse';

// Wednesday, 24 June 2026, 10:00 local.
const NOW = new Date(2026, 5, 24, 10, 0, 0);

describe('parseVoiceCommand', () => {
  it('parses "remind me to buy medicine tomorrow at 5pm"', () => {
    const r = parseVoiceCommand('remind me to buy medicine tomorrow at 5pm', NOW);
    expect(r.title).toBe('Buy medicine');
    expect(r.type).toBe('task');
    expect(r.date).toBe('2026-06-25');
    expect(r.time).toBe('17:00');
    expect(r.remind).toBe(true);
  });

  it('parses "gym monday at 6am" -> next Monday, workout, no reminder', () => {
    const r = parseVoiceCommand('gym monday at 6am', NOW);
    expect(r.title).toBe('Gym');
    expect(r.type).toBe('workout');
    expect(r.date).toBe('2026-06-29');
    expect(r.time).toBe('06:00');
    expect(r.remind).toBe(false);
  });

  it('parses "dinner with mom tonight" -> meal, today, evening', () => {
    const r = parseVoiceCommand('dinner with mom tonight', NOW);
    expect(r.title).toBe('Dinner with mom');
    expect(r.type).toBe('meal');
    expect(r.date).toBe('2026-06-24');
    expect(r.time).toBe('19:00');
    expect(r.remind).toBe(false);
  });

  it('parses "remind me to call John at 2:30pm" -> event, reminder, 14:30', () => {
    const r = parseVoiceCommand('remind me to call John at 2:30pm', NOW);
    expect(r.title).toBe('Call John');
    expect(r.type).toBe('event');
    expect(r.date).toBe('2026-06-24');
    expect(r.time).toBe('14:30');
    expect(r.remind).toBe(true);
  });

  it('defaults to today at 9:00 task when nothing is specified', () => {
    const r = parseVoiceCommand('water the plants', NOW);
    expect(r.title).toBe('Water the plants');
    expect(r.type).toBe('task');
    expect(r.date).toBe('2026-06-24');
    expect(r.time).toBe('09:00');
    expect(r.remind).toBe(false);
  });
});
