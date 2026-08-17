export type AchievementDestination = 'feed' | 'story' | 'private';

export type AchievementShareDecision = {
  destination: AchievementDestination | null;
  confirmed: boolean;
};

export function initialAchievementShareDecision(): AchievementShareDecision {
  return { destination: null, confirmed: false };
}

export function chooseAchievementDestination(
  _decision: AchievementShareDecision,
  destination: AchievementDestination,
): AchievementShareDecision {
  return { destination, confirmed: false };
}

export function confirmAchievementShare(
  decision: AchievementShareDecision,
): AchievementShareDecision {
  return decision.destination === null ? decision : { ...decision, confirmed: true };
}

export function resetAchievementShareDecision(
  _decision: AchievementShareDecision,
): AchievementShareDecision {
  return initialAchievementShareDecision();
}
