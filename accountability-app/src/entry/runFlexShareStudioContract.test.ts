import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const run = readFileSync(resolve(process.cwd(), 'src/activity/RunShareSheet.tsx'), 'utf8');
const winCard = readFileSync(resolve(process.cwd(), 'src/app/win-card.tsx'), 'utf8');

describe('Run and Flex Share Studio integration', () => {
  test('Run opens the reusable studio and preserves its operation and visibility draft', () => {
    expect(run).toContain("import { ShareStudio");
    expect(run).toContain('createRunShareMediaOverrideController');
    expect(run).toContain('uploadRunFeedImage');
    expect(run).toContain('freezeRunShareRenderInputs');
    expect(run).toContain('runShareRenderModel');
    expect(run).toContain('renderDestinationPreview');
    expect(run).toContain('unavailableReason={feedShare.reason}');
    expect(run).toMatch(/shareStudioCaptureSize\.current = runShareExportSize\([\s\S]*?reviewed\.format,[\s\S]*?reviewed\.presentation\.originalRatio/);
    expect(run).toContain('<ShareStudio');
    expect(run).toMatch(/operationId:\s*draft!\.operationId/);
    expect(run).toMatch(/showPublicly:\s*draft!\.showPublicly/);
    expect(run).toMatch(/await onDestination\('feed', draft\);[\s\S]*?await draft\.media\.release\(\)\.catch/);
    expect(run).toMatch(/const restored = shareMediaOverride\.current!\.cancel\(\)/);
    expect(run).toMatch(/const committed = shareMediaOverride\.current!\.commit\(\)/);
    expect(run).not.toMatch(/setPhotoUri\(draft\.media\.uri\)/);
    expect(run).toMatch(/function cancelRunShareStudio\(\)[\s\S]*?feedOperation\.current = null;[\s\S]*?setShareStudioVisible\(false\)/);
    expect(run).not.toContain("setAudience('buddies')");
    expect(run).toContain('onContinueToFeed={openFeedStudio}');
    expect(run).not.toContain('<AchievementSharePrompt');
    expect(run).toContain('date: new Date(run.completedAt).toLocaleDateString()');
  });

  test('Run keeps the camera button compact and offers all background sources before posting', () => {
    expect(run).toContain('accessibilityLabel="Change Run card background"');
    expect(run).toContain('label="Selfie"');
    expect(run).toContain('label="Camera"');
    expect(run).toContain('label="Gallery"');
    expect(run).toContain('label="Route map"');
    expect(run).toMatch(/modeRow:\s*\{[\s\S]*?flexWrap:\s*'wrap'/);
    expect(run).toMatch(/modeBtn:\s*\{[\s\S]*?minHeight:\s*48/);
  });

  test('Flex uses one Share Studio and publishes the reviewed typed draft once', () => {
    expect(winCard).toContain("import { ShareStudio");
    expect(winCard).toContain('createProofShareRenderModel');
    expect(winCard).toContain('renderDestinationPreview');
    expect(winCard).toContain('unavailableReason={feedShare.reason}');
    expect(winCard).toContain('MOBILE_FEED_SHARING_NOTICE');
    expect(winCard).toContain('<ShareStudio');
    expect(winCard).toContain("journalDurableAction(token, 'post-feed', base64, shareBody, false, draft.operationId)");
    expect(winCard).toContain('operationId: pending.operationId');
    expect(winCard).toContain('showPublicly: draft.showPublicly');
    expect(winCard).toContain('context: publishContext');
    expect(winCard).toMatch(/await confirmDurableAction\(pending\);[\s\S]*?await draft\.media\.release\(\)\.catch/);
    expect(winCard).not.toContain('<AchievementSharePrompt');
  });
});
