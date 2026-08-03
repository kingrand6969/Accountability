import { describe, expect, it } from '@jest/globals';
import { buildFriendlyFinanceSummary } from './FinanceFriendly';
import * as friendlyFinance from './FinanceFriendly';

describe('buildFriendlyFinanceSummary', () => {
  it('switches the friendly summary to reflow layout at 175 percent text', () => {
    const usesLargeTextFinanceLayout = (
      friendlyFinance as typeof friendlyFinance & {
        usesLargeTextFinanceLayout?: (fontScale: number) => boolean;
      }
    ).usesLargeTextFinanceLayout;

    expect(typeof usesLargeTextFinanceLayout).toBe('function');
    expect(usesLargeTextFinanceLayout?.(1.3)).toBe(false);
    expect(usesLargeTextFinanceLayout?.(1.75)).toBe(true);
    expect(usesLargeTextFinanceLayout?.(2)).toBe(true);
  });

  it('maps the friendly labels to the same underlying finance values', () => {
    expect(
      buildFriendlyFinanceSummary({
        available: 1500,
        spent: 620,
        saved: 400,
        needsAttention: 85,
      }),
    ).toEqual({
      available: 1500,
      spent: 620,
      saved: 400,
      needsAttention: 85,
    });
  });

  it('never presents negative activity totals as friendly progress', () => {
    expect(
      buildFriendlyFinanceSummary({
        available: -100,
        spent: -1,
        saved: -20,
        needsAttention: -30,
      }),
    ).toEqual({
      available: -100,
      spent: 0,
      saved: 0,
      needsAttention: 0,
    });
  });
});
