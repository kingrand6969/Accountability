import { describe, expect, it } from '@jest/globals';
import {
  billingAdapter,
  registerBillingAdapter,
  type BillingAdapter,
} from './billingAdapter';

describe('billing adapter gate', () => {
  it('does not claim a purchase or restore when no native provider is registered', async () => {
    await expect(billingAdapter().purchase('monthly')).resolves.toMatchObject({
      status: 'unavailable',
    });
    await expect(billingAdapter().restore()).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  it('can register and cleanly remove a real provider adapter', async () => {
    const provider: BillingAdapter = {
      availability: async () => ({ ready: true, environment: 'preview' }),
      purchase: async () => ({ status: 'purchased' }),
      restore: async () => ({ status: 'restored' }),
    };
    const unregister = registerBillingAdapter(provider);
    expect(billingAdapter()).toBe(provider);
    await expect(billingAdapter().purchase('yearly')).resolves.toEqual({ status: 'purchased' });
    unregister();
    expect(billingAdapter()).not.toBe(provider);
  });
});
