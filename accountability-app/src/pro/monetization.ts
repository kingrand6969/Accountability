// ── Monetization launch switches ─────────────────────────────────────────────
// Both are OFF for the free v1 (Google Play first). The whole app is already
// built for paid Pro + in-feed ads — these two flags just hide the money
// surfaces until the billing/ads SDKs are wired against real store products.
//
// v1.1 "turn on Pro" checklist:
//   1. Create the subscription products in Google Play Console (App Store later).
//   2. Wire RevenueCat (react-native-purchases) so entitlements set `is_pro`.
//   3. Set CHECKOUT_ENABLED = true. (The paywall UI is already built.)
//
// v1.x "turn on ads" (optional — only worth it at real daily-user scale):
//   4. Create AdMob units, wire react-native-google-mobile-ads (+ iOS ATT prompt
//      and privacy-label update), then set ADS_ENABLED = true.
//
// Until CHECKOUT_ENABLED flips, grant Pro to yourself / early users via
// admin_grant_pro (migration 0060) for comps and trials.

export const CHECKOUT_ENABLED = false;
export const ADS_ENABLED = false;
