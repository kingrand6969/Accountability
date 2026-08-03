import { describe, expect, it } from '@jest/globals';
import { resolveAddRouteSeed, resolveTodayRouteSeed } from './scheduleRouteState';

describe('schedule route state', () => {
  it('builds Add state directly from valid route parameters', () => {
    expect(
      resolveAddRouteSeed(
        { date: '2026-08-04', time: '14:00', type: 'task' },
        { date: '2026-08-03', time: '10:00' },
      ),
    ).toEqual({
      key: JSON.stringify(['2026-08-04', '14:00', 'task']),
      date: '2026-08-04',
      time: '14:00',
      type: 'task',
      detailsOpen: true,
    });
  });

  it('keeps Add defaults for missing or unsupported parameters', () => {
    expect(
      resolveAddRouteSeed(
        { time: ['14:00'], type: 'workout' },
        { date: '2026-08-03', time: '10:00' },
      ),
    ).toEqual({
      key: JSON.stringify([null, null, null]),
      date: '2026-08-03',
      time: '10:00',
      type: 'event',
      detailsOpen: false,
    });
  });

  it('resolves a valid Today date and falls back for invalid input', () => {
    const fallback = new Date('2026-08-03T08:00:00');
    const routed = resolveTodayRouteSeed('2026-08-04', fallback);
    expect(routed.key).toBe('2026-08-04');
    expect(routed.day).toEqual(new Date('2026-08-04T12:00:00'));

    expect(resolveTodayRouteSeed(['2026-08-04'], fallback)).toEqual({
      key: 'today',
      day: fallback,
    });
  });
});
