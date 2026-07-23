import { deletePost, hidePost, reportPost } from './api';
import { showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { openPostMenu } from './PostMenu';

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
    openPostMenu({
      preview,
      options: [
        {
          label: 'Remove post',
          subtitle: 'Deletes it for everyone, permanently',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            confirmDialog({
              title: 'Remove this post?',
              message: 'It will be deleted for everyone.',
              confirmLabel: 'Remove',
              destructive: true,
              onConfirm: async () => {
                try {
                  await deletePost(post.id);
                  onRemoved(post.id);
                  showToast('Post removed');
                } catch (e) {
                  showToast(`Could not remove: ${String((e as Error).message ?? e)}`);
                }
              },
            }),
        },
      ],
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
