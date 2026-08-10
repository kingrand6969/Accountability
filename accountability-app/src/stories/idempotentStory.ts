export type IdempotentStoryInput = {
  expectedOwnerId: string;
  operationId: string;
  base64: string;
  ext: string;
  caption?: string;
};

type Dependencies = {
  currentOwnerId(): Promise<string | null>;
  upload(input: IdempotentStoryInput): Promise<string>;
  commit(input: {
    expectedOwnerId: string;
    operationId: string;
    imageUrl: string;
    caption?: string;
  }): Promise<string>;
};

export async function createIdempotentStory(
  input: IdempotentStoryInput,
  dependencies: Dependencies,
): Promise<string> {
  if (await dependencies.currentOwnerId() !== input.expectedOwnerId) {
    throw new Error('Account changed. Nothing was shared.');
  }
  const imageUrl = await dependencies.upload(input);
  if (await dependencies.currentOwnerId() !== input.expectedOwnerId) {
    throw new Error('Account changed. Nothing was shared.');
  }
  return dependencies.commit({
    expectedOwnerId: input.expectedOwnerId,
    operationId: input.operationId,
    imageUrl,
    caption: input.caption,
  });
}
