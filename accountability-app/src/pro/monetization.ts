import Constants from 'expo-constants';

export const PRO_PRICING = {
  monthly: { productId: 'accountability_pro_monthly', displayPrice: '$5.99', period: 'month' },
  yearly: { productId: 'accountability_pro_yearly', displayPrice: '$39.99', period: 'year' },
} as const;

export type MonetizationEnvironment = 'preview' | 'production' | 'development';

export type MonetizationConfig = {
  environment: MonetizationEnvironment;
  billing: {
    configured: boolean;
    publicApiKey: string | null;
    entitlementId: string;
    monthlyProductId: string;
    yearlyProductId: string;
  };
  ads: { configured: boolean; feedUnitId: string | null };
};

type PublicEnvironment = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

export function buildMonetizationConfig(env: PublicEnvironment): MonetizationConfig {
  const environment =
    env.EXPO_PUBLIC_APP_VARIANT === 'production'
      ? 'production'
      : env.EXPO_PUBLIC_APP_VARIANT === 'preview'
        ? 'preview'
        : 'development';
  const publicApiKey = clean(env.EXPO_PUBLIC_REVENUECAT_API_KEY);
  const feedUnitId = clean(env.EXPO_PUBLIC_ADMOB_FEED_UNIT_ID);

  return {
    environment,
    billing: {
      configured: !!publicApiKey,
      publicApiKey,
      entitlementId: clean(env.EXPO_PUBLIC_PRO_ENTITLEMENT_ID) ?? 'pro',
      monthlyProductId:
        clean(env.EXPO_PUBLIC_PRO_MONTHLY_PRODUCT_ID) ?? PRO_PRICING.monthly.productId,
      yearlyProductId:
        clean(env.EXPO_PUBLIC_PRO_YEARLY_PRODUCT_ID) ?? PRO_PRICING.yearly.productId,
    },
    ads: { configured: !!feedUnitId, feedUnitId },
  };
}

const runtimeVariant = Constants.expoConfig?.extra?.appVariant;
export const MONETIZATION = buildMonetizationConfig({
  ...process.env,
  EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT ?? runtimeVariant,
});
