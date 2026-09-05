export const ACHIEVEMENT_COMPLETION_KINDS = [
  'manual',
  'streak',
  'workout',
  'challenge',
  'medal',
  'rank',
  'leaderboard',
  'run',
] as const;

export type AchievementCompletionKind = (typeof ACHIEVEMENT_COMPLETION_KINDS)[number];

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
