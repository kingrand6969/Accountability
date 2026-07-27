import { deletePost, hidePost, reportPost, updatePostAudience } from './api';
import { showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { openPostMenu } from './PostMenu';
import { router } from 'expo-router';
import { saveRemoteImageToMemories } from '../memories/api';
import type { PostAudience } from './types';

/**
 * The ⋮ menu for any post card, shared by the feed, post detail, group and
 * page screens. Own post → Remove (delete for everyone, confirmed first).
 * Someone else's post → Hide (this viewer only) or Report (goes to the team's
 * Reports queue with the text quoted, and hides it for the reporter).
 *
 * Uses the app's own branded sheet + confirm dialogs (PostMenuHost/ConfirmHost
 * in the root layout) — NEVER the OS Alert or browser dialogs, which are
 * unreliable on the web preview. `onRemoved` fires once the post should
 * disappear from the caller's UI.
 */
export function showPostMenu(
  post: {
    id: string;
    user_id: string;
    body: string | null;
    author_name?: string | null;
    author_avatar?: string | null;
    image_url?: string | null;
    audience?: PostAudience;
  },
  myId: string | null,
  onRemoved: (postId: string) => void,
): void {
  const mine = !!myId && post.user_id === myId;
  const preview = {
    name: mine ? 'Your post' : (post.author_name ?? null),
    body: post.body,
    avatar: post.author_avatar ?? null,
  };

  if (mine) {
    const options = [
      {
        label: 'Edit post',
        subtitle: 'Update your words',
        icon: 'create-outline' as const,
        onPress: () => router.push({ pathname: '/compose', params: { edit: post.id } }),
      },
      ...(post.audience !== 'group'
        ? [{
            label: 'Change audience',
            subtitle: post.audience === 'public' ? 'Public' : 'Buddies',
            icon: 'earth-outline' as const,
            onPress: () =>
              openPostMenu({
                preview,
                options: ([
                  ['buddies', 'Buddies', 'Only your accountability buddies'],
                  ['public', 'Public', 'Also appears in Discover'],
                ] as const).map(([audience, label, subtitle]) => ({
                  label,
                  subtitle,
                  icon: audience === 'public' ? 'earth-outline' : 'people-outline',
                  onPress: async () => {
                    try {
                      await updatePostAudience(post.id, audience);
                      showToast(`Audience changed to ${label}`);
                    } catch (e) {
                      showToast(`Could not change audience: ${String((e as Error).message ?? e)}`);
                    }
                  },
                })),
              }),
          }]
        : []),
      ...(post.image_url
        ? [{
            label: 'Save to Memories',
            subtitle: 'Keep this achievement',
            icon: 'bookmark-outline' as const,
            onPress: async () => {
              try {
                await saveRemoteImageToMemories(post.image_url!);
                showToast('Saved to Memories');
              } catch (e) {
                showToast(`Could not save: ${String((e as Error).message ?? e)}`);
              }
            },
          }]
        : []),
      {
        label: 'Delete post',
        subtitle: 'You will be asked to confirm',
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: () =>
          confirmDialog({
            title: 'Delete this post?',
            message: 'It will be removed for everyone. Your saved activities and Memories are not deleted.',
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: async () => {
              try {
                await deletePost(post.id);
                onRemoved(post.id);
                showToast('Post deleted');
              } catch (e) {
                showToast(`Could not delete: ${String((e as Error).message ?? e)}`);
              }
            },
          }),
      },
    ];
    openPostMenu({
      preview,
      options,
    });
    return;
  }

  openPostMenu({
    preview,
    options: [
      {
        label: 'Hide post',
        subtitle: 'Only removes it from your feed',
        icon: 'eye-off-outline',
        onPress: async () => {
          try {
            await hidePost(post.id);
            onRemoved(post.id);
            showToast('Post hidden from your feed');
          } catch (e) {
            showToast(`Could not hide: ${String((e as Error).message ?? e)}`);
          }
        },
      },
      {
        label: 'Report post',
        subtitle: 'Our team reviews it — it also hides for you',
        icon: 'flag-outline',
        destructive: true,
        onPress: () =>
          confirmDialog({
            title: 'Report this post?',
            message: 'Our team will review it. The post will also be hidden from your feed.',
            confirmLabel: 'Report',
            destructive: true,
            onConfirm: async () => {
              try {
                await reportPost(post);
                await hidePost(post.id).catch(() => {});
                onRemoved(post.id);
                showToast('Report received — thank you. Our team will review it promptly.');
              } catch (e) {
                showToast(`Could not report: ${String((e as Error).message ?? e)}`);
              }
            },
          }),
      },
    ],
  });
}
