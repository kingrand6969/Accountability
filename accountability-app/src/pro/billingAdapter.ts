import { MONETIZATION, type MonetizationEnvironment } from './monetization';

export type ProPlan = 'monthly' | 'yearly';
export type BillingAvailability =
  | { ready: true; environment: MonetizationEnvironment }
  | {
      ready: false;
      environment: MonetizationEnvironment;
      reason: 'missing_configuration' | 'provider_not_installed' | 'provider_error';
      message: string;
    };
export type PurchaseResult =
  | { status: 'purchased' | 'restored' }
  | { status: 'cancelled' }
  | { status: 'unavailable'; message: string };

export interface BillingAdapter {
  availability(): Promise<BillingAvailability>;
  purchase(plan: ProPlan): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
}

const unavailableAdapter: BillingAdapter = {
  async availability() {
    if (!MONETIZATION.billing.configured) {
      return {
        ready: false,
        environment: MONETIZATION.environment,
        reason: 'missing_configuration',
        message:
          MONETIZATION.environment === 'preview'
            ? 'Purchases are unavailable in this staging build.'
            : 'Purchases are not available yet.',
      };
    }
    return {
      ready: false,
      environment: MONETIZATION.environment,
      reason: 'provider_not_installed',
      message: 'The secure store connection is not included in this build.',
    };
  },
  async purchase() {
    const state = await this.availability();
    return { status: 'unavailable', message: state.ready ? 'Purchases are unavailable.' : state.message };
  },
  async restore() {
    const state = await this.availability();
    return { status: 'unavailable', message: state.ready ? 'Restore is unavailable.' : state.message };
  },
};

let activeAdapter: BillingAdapter = unavailableAdapter;

/** Called only by a real native billing integration during app startup. */
export function registerBillingAdapter(adapter: BillingAdapter): () => void {
  activeAdapter = adapter;
  return () => {
    if (activeAdapter === adapter) activeAdapter = unavailableAdapter;
  };
}

export function billingAdapter(): BillingAdapter {
  return activeAdapter;
}
