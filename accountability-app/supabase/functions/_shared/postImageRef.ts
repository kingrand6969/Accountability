const OWNER_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const OPERATION_UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const LEGACY_FILENAME = '[A-Za-z0-9][A-Za-z0-9._-]{0,127}\\.(?:jpe?g|png|webp)';
const POST_IMAGE_REF = new RegExp(
  `^r2://post-images/(${OWNER_UUID})/(?:(` +
  `${OPERATION_UUID_V4})/([a-f0-9]{64}\\.(?:jpg|png))|(${LEGACY_FILENAME}))$`,
  'i',
);

export type ParsedPostImageObjectRef = Readonly<{
  ownerId: string;
  key: string;
  format: 'legacy' | 'operation';
}>;

/** Strict parser shared by services that sign reads for private post images. */
export function parsePostImageObjectRef(
  raw: string,
  expectedOwnerId?: string,
): ParsedPostImageObjectRef | null {
  if (raw.length > 256) return null;
  const match = POST_IMAGE_REF.exec(raw);
  if (!match?.[1] || (expectedOwnerId !== undefined && match[1] !== expectedOwnerId)) return null;
  const relativePath = match[2] && match[3] ? `${match[2]}/${match[3]}` : match[4];
  if (!relativePath) return null;
  return Object.freeze({
    ownerId: match[1],
    key: `post-images/${match[1]}/${relativePath}`,
    format: match[2] ? 'operation' : 'legacy',
  });
}
