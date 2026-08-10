import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('achievement sharing integration', () => {
  test('run completion uses the generated run card for confirmed Feed and My Day shares', () => {
    const sheet = source('src/activity/RunShareSheet.tsx');

    expect(sheet).toContain("import { addStory } from '../stories/api'");
    expect(sheet).toContain("import { AchievementSharePrompt } from '../entry/AchievementSharePrompt'");
    expect(sheet).toContain('<AchievementSharePrompt');
    expect(sheet).toContain("onFeed={() => onDestination('feed')}");
    expect(sheet).toContain('onStory={onStoryDestination}');
    expect(sheet).toContain("addStory(base64, 'jpg', caption)");
    expect(sheet).toContain('onPrivate={() => closeEditor()}');
  });

  test('the run Feed action opens confirmation instead of publishing directly', () => {
    const sheet = source('src/activity/RunShareSheet.tsx');
    const actions = source('src/activity/RunMediaActions.tsx');

    expect(sheet).toContain('onShareAchievement={() => setSharePromptVisible(true)}');
    expect(actions).not.toContain("destination: 'feed'");
    expect(actions).not.toContain('disabled={disabled || working || feedReason !== null}');
  });

  test('a workout opens the reusable achievement card only when its checklist becomes complete', () => {
    const item = source('src/app/item/[id].tsx');

    expect(item).toContain("item?.type === 'workout'");
    expect(item).toContain('becameCompleteChecklist(list, next)');
    expect(item).toContain("pathname: '/win-card'");
    expect(item).toContain("achievementKind: 'workout'");
  });

  test('streak and ended challenge wins enter the same explicit Win Card sharing path', () => {
    const winCard = source('src/app/win-card.tsx');
    const challenge = source('src/app/challenge/[id].tsx');

    expect(winCard).toContain('<AchievementSharePrompt');
    expect(winCard).toContain('onStory={onShareToStory}');
    expect(winCard).toContain("await addStory(base64, 'png', message)");
    expect(challenge).toContain("achievementKind: 'challenge'");
    expect(challenge).toContain("pathname: '/win-card'");
    expect(challenge).toContain('Flex this challenge');
  });
});
