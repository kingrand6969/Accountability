import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('achievement sharing integration', () => {
  test('run completion uses the generated run card for explicit Feed and My Day shares', () => {
    const sheet = source('src/activity/RunShareSheet.tsx');

    expect(sheet).toContain("import { addStoryIdempotent } from '../stories/api'");
    expect(sheet).not.toContain('<AchievementSharePrompt');
    expect(sheet).toContain('setShareStudioVisible(true)');
    expect(sheet).toContain('<ShareStudio');
    expect(sheet).toContain('onContinue={publishRunDraft}');
    expect(sheet).toContain('onMyDay={onStoryDestination}');
    expect(sheet).toContain('addStoryIdempotent({');
  });

  test('the run Feed action opens the caption and visibility studio directly', () => {
    const sheet = source('src/activity/RunShareSheet.tsx');
    const actions = source('src/activity/RunMediaActions.tsx');

    expect(sheet).toContain('onContinueToFeed={openFeedStudio}');
    expect(sheet).toContain('function openFeedStudio(): void');
    expect(actions).toContain('Continue to Feed');
    expect(actions).not.toContain("destination: 'feed'");
    expect(actions).toContain("destination: 'story'");
  });

  test('a workout opens the reusable achievement card only when its checklist becomes complete', () => {
    const item = source('src/app/item/[id].tsx');

    expect(item).toContain("it.type === 'workout'");
    expect(item).toContain('becameCompleteChecklist(previous, next)');
    expect(item).toContain("pathname: '/win-card'");
    expect(item).toContain("achievementKind: 'workout'");
  });

  test('gym and exercise screens save workout definitions; they do not claim completion', () => {
    const gym = source('src/app/gym.tsx');
    const exercise = source('src/app/exercise/[id].tsx');

    expect(gym).toContain('done: false');
    expect(exercise).toContain('done: false');
    expect(gym).not.toContain('<AchievementSharePrompt');
    expect(exercise).not.toContain('<AchievementSharePrompt');
  });

  test('streak and ended challenge wins enter the same explicit Win Card sharing path', () => {
    const winCard = source('src/app/win-card.tsx');
    const challenge = source('src/app/challenge/[id].tsx');

    expect(winCard).toContain('<ShareStudio');
    expect(winCard).toContain('onContinue={onShareToFeed}');
    expect(winCard).toContain('label="Add to My Day"');
    expect(winCard).toContain('await addStoryIdempotent({');
    expect(challenge).toContain("achievementKind: 'challenge'");
    expect(challenge).toContain("pathname: '/win-card'");
    expect(challenge).toContain('hasVerifiedChallengeWin(');
    expect(challenge).toContain('Flex this win');
  });
});
