import { describe, expect, it } from '@jest/globals';
import { feedAdsReady, registerFeedAdAdapter, renderFeedAd } from './adAdapter';

describe('feed ad adapter gate', () => {
  it('renders no fake ad when provider configuration is absent', () => {
    const unregister = registerFeedAdAdapter({
      ready: () => true,
      renderFeedAd: () => 'provider ad',
    });
    expect(feedAdsReady()).toBe(false);
    expect(renderFeedAd()).toBeNull();
    unregister();
  });
});
