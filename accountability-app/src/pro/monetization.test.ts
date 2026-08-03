import { describe, expect, it } from '@jest/globals';
import { buildMonetizationConfig, PRO_PRICING } from './monetization';

describe('monetization configuration', () => {
  it('keeps billing and ads unavailable without provider configuration', () => {
    const config = buildMonetizationConfig({ EXPO_PUBLIC_APP_VARIANT: 'preview' });
    expect(config.environment).toBe('preview');
    expect(config.billing.configured).toBe(false);
    expect(config.ads.configured).toBe(false);
    expect(config.billing.publicApiKey).toBeNull();
    expect(config.ads.feedUnitId).toBeNull();
  });

  it('only marks a surface configured when its own public provider value exists', () => {
    const billingOnly = buildMonetizationConfig({
      EXPO_PUBLIC_REVENUECAT_API_KEY: ' rc_public ',
    });
    expect(billingOnly.billing.configured).toBe(true);
    expect(billingOnly.billing.publicApiKey).toBe('rc_public');
    expect(billingOnly.ads.configured).toBe(false);

    const adsOnly = buildMonetizationConfig({
      EXPO_PUBLIC_ADMOB_FEED_UNIT_ID: ' feed-unit ',
    });
    expect(adsOnly.billing.configured).toBe(false);
    expect(adsOnly.ads.configured).toBe(true);
    expect(adsOnly.ads.feedUnitId).toBe('feed-unit');
  });

  it('uses the approved launch prices and stable default product ids', () => {
    expect(PRO_PRICING.monthly).toMatchObject({
      displayPrice: '$5.99',
      productId: 'accountability_pro_monthly',
    });
    expect(PRO_PRICING.yearly).toMatchObject({
      displayPrice: '$39.99',
      productId: 'accountability_pro_yearly',
    });
  });
});
