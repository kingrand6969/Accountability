import { readFileSync } from 'node:fs';
import { describe, expect, jest, test } from '@jest/globals';

import { postDetailStatusBarStyle } from './ImmersivePost';
import type { FeedPost } from './types';

jest.mock('./Avatar', () => ({ Avatar: () => null }));
jest.mock('./PostImage', () => ({ PostImage: () => null }));
jest.mock('./PostVideo', () => ({ PostVideo: () => null }));

const routeSource = readFileSync(require.resolve('../app/(app)/post/[id]'), 'utf8');
const immersiveSource = readFileSync(require.resolve('./ImmersivePost'), 'utf8');

const compactPost = {
  post_type: 'post',
  image_url: null,
} as FeedPost;

const immersivePost = {
  post_type: 'photo',
  image_url: 'https://example.com/proof.jpg',
} as FeedPost;

describe('Post detail Light/Dark appearance contract', () => {
  test('uses light status-bar content for dark or immersive detail while keeping light compact defaults', () => {
    expect(postDetailStatusBarStyle(null)).toBe('dark');
    expect(postDetailStatusBarStyle(compactPost)).toBe('dark');
    expect(postDetailStatusBarStyle(null, 'dark')).toBe('light');
    expect(postDetailStatusBarStyle(compactPost, 'dark')).toBe('light');
    expect(postDetailStatusBarStyle(immersivePost, 'light')).toBe('light');
    expect(postDetailStatusBarStyle(immersivePost, 'dark')).toBe('light');
    expect(routeSource).toContain('postDetailStatusBarStyle(post, mode)');
  });

  test('themes loading, errors, comments, and the keyboard-safe composer from semantic roles', () => {
    expect(routeSource).toContain("from '../../../ui/AppThemeProvider'");
    expect(routeSource).toContain('createStyles(theme)');
    expect(routeSource).toContain('backgroundColor: theme.surface.canvas');
    expect(routeSource).toContain('backgroundColor: theme.surface.card');
    expect(routeSource).toContain('borderTopColor: theme.border.subtle');
    expect(routeSource).toContain('color: theme.ink.primary');
    expect(routeSource).toContain('color: theme.ink.muted');
    expect(routeSource).toContain('placeholderTextColor={theme.ink.muted}');
    expect(routeSource).toContain('minHeight: spacing.touch');
    expect(routeSource).toContain('<KeyboardAvoidingView');
    expect(routeSource).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
  });

  test('themes compact text and event chrome without recoloring immersive media overlays', () => {
    expect(immersiveSource).toContain("from '../ui/AppThemeProvider'");
    expect(immersiveSource).toContain('createCompactStyles(theme');
    expect(immersiveSource).toContain('backgroundColor: theme.surface.card');
    expect(immersiveSource).toContain('borderBottomColor: theme.border.subtle');
    expect(immersiveSource).toContain('color: theme.ink.primary');
    expect(immersiveSource).toContain('color: theme.ink.muted');
    expect(immersiveSource).toContain("colors={['rgba(2,8,20,.22)', 'transparent', 'rgba(2,8,20,.96)']}");
    expect(immersiveSource).toContain("color: '#fff'");
    expect(immersiveSource).toContain('width: spacing.touch');
    expect(immersiveSource).toContain('height: spacing.touch');
  });
});
