export type ProofPrivacy = {
  hideLocation: boolean;
  hideRoute: boolean;
  hideAmounts: boolean;
  hideBuddyNames: boolean;
  hideBuddyPortraits: boolean;
};

export const DEFAULT_PROOF_PRIVACY: Readonly<ProofPrivacy> = Object.freeze({
  hideLocation: true,
  hideRoute: true,
  hideAmounts: true,
  hideBuddyNames: true,
  hideBuddyPortraits: true,
});

const PUBLIC_CARD_FIELDS = [
  'brand',
  'headline',
  'format',
  'workouts',
  'activities',
  'streak',
] as const;

const PRIVATE_CARD_FIELDS: readonly {
  key: 'location' | 'route' | 'amounts' | 'buddyNames' | 'buddyPortraits';
  privacyKey: keyof ProofPrivacy;
}[] = [
  { key: 'location', privacyKey: 'hideLocation' },
  { key: 'route', privacyKey: 'hideRoute' },
  { key: 'amounts', privacyKey: 'hideAmounts' },
  { key: 'buddyNames', privacyKey: 'hideBuddyNames' },
  { key: 'buddyPortraits', privacyKey: 'hideBuddyPortraits' },
];

export type RedactedProof = Partial<
  Record<
    | (typeof PUBLIC_CARD_FIELDS)[number]
    | (typeof PRIVATE_CARD_FIELDS)[number]['key'],
    unknown
  >
>;

export function redactProofFields(
  input: Readonly<Record<string, unknown>>,
  privacy: Readonly<ProofPrivacy>,
): RedactedProof {
  const redacted: RedactedProof = {};

  for (const key of PUBLIC_CARD_FIELDS) {
    const safeValue = safeCardValue(input[key]);
    if (safeValue !== undefined) redacted[key] = safeValue;
  }

  for (const { key, privacyKey } of PRIVATE_CARD_FIELDS) {
    if (privacy[privacyKey]) continue;
    const safeValue = safeCardValue(input[key]);
    if (safeValue !== undefined) redacted[key] = safeValue;
  }

  return redacted;
}

export function sanitizeProofParam(value: unknown, maxLength = 80): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const sanitized = sanitizeProofScalar(item, maxLength);
      if (sanitized !== null) return sanitized;
    }
    return null;
  }
  return sanitizeProofScalar(value, maxLength);
}

function sanitizeProofScalar(value: unknown, maxLength: number): string | null {
  const raw = value;
  if (typeof raw !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(raw)) return null;
  if (/\p{Cf}/u.test(raw)) return null;

  const normalized = raw.trim().replace(/\s+/gu, ' ');
  if (!normalized) return null;

  let inspected = normalized;
  for (let index = 0; index < 8; index += 1) {
    try {
      const decoded = decodeURIComponent(inspected);
      if (decoded === inspected) break;
      inspected = decoded;
    } catch {
      return null;
    }
  }

  const decodedBase64 = decodeBoundedBase64(inspected);
  const unsafe =
    isUnsafeProofText(inspected) ||
    (decodedBase64 !== null && isUnsafeProofText(decodedBase64));

  return unsafe ? null : normalized.slice(0, Math.max(0, maxLength));
}

function isUnsafeProofText(inspected: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/iu.test(inspected) ||
    /%[0-9a-f]{2}/iu.test(inspected) ||
    /(?:^|[?&\s])(?:[a-z][a-z0-9]*_)?id\s*=/iu.test(inspected) ||
    /\b(?:user|post|owner|account|profile|buddy|memory)_?id\b/iu.test(inspected) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu.test(
      inspected,
    ) ||
    /\b[0-9a-f]{32}\b/iu.test(inspected) ||
    /\b(?:awsaccesskeyid|credential|signature|authorization|security-token)\s*=/iu.test(inspected) ||
    /(?:supabase|cloudflarestorage|storage\/v1|x-amz-|[?&](?:token|signature|sig|expires)=)/iu.test(
      inspected,
    ) ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(inspected) ||
    /\p{Cf}/u.test(inspected)
  );
}

function decodeBoundedBase64(value: string): string | null {
  if (value.length < 8 || value.length > 512 || !/^[a-z0-9+/_-]+={0,2}$/iu.test(value)) {
    return null;
  }
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const decoded = globalThis.atob(padded);
    return /^[\x09\x0a\x0d\x20-\x7e]+$/u.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function safeCardValue(value: unknown): string | number | boolean | string[] | undefined {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return sanitizeProofParam(value) ?? undefined;
  if (!Array.isArray(value)) return undefined;

  const safeItems = value
    .map((item) => sanitizeProofParam(item))
    .filter((item): item is string => item !== null);
  return safeItems.length > 0 ? safeItems : undefined;
}
