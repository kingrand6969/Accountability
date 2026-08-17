export type AchievementCompletionKind = 'run' | 'workout' | 'streak' | 'challenge';

export type AchievementCompletion = {
  kind: AchievementCompletionKind;
  sourceId: string;
  text: string;
  mediaUri: string | null;
};

export function achievementPayloadKey(payload: AchievementCompletion): string {
  return `${payload.kind}:${payload.sourceId}`;
}

export type AchievementStoryOperation = { payloadKey: string; operationId: string };

export function retainAchievementStoryOperation(
  existing: AchievementStoryOperation | null,
  payload: AchievementCompletion,
  createOperationId: () => string,
): AchievementStoryOperation {
  const payloadKey = achievementPayloadKey(payload);
  return existing?.payloadKey === payloadKey
    ? existing
    : { payloadKey, operationId: createOperationId() };
}
