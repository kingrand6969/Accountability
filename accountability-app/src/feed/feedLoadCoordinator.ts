export type FeedCriticalLoadResult = 'loaded' | 'failed' | 'stale';

export async function runFeedCriticalLoad<
  Post extends { id: string },
  Previews,
>({
  loadPage,
  loadPreviews,
  isCurrent,
  onPage,
  onPageError,
  onPreviews,
  onVisibleSettled,
}: {
  loadPage: () => Promise<Post[]>;
  loadPreviews: (postIds: string[]) => Promise<Previews>;
  isCurrent: () => boolean;
  onPage: (page: Post[]) => void;
  onPageError: (error: unknown) => void;
  onPreviews: (previews: Previews) => void;
  onVisibleSettled: () => void;
}): Promise<FeedCriticalLoadResult> {
  try {
    const page = await loadPage();
    if (!isCurrent()) return 'stale';

    onPage(page);
    onVisibleSettled();

    try {
      void loadPreviews(page.map((post) => post.id))
        .then((previews) => {
          if (isCurrent()) onPreviews(previews);
        })
        .catch(() => {
          // Supporter summaries are decoration; preserve current rows and previews.
        });
    } catch {
      // A synchronous decoration failure must not turn a visible page into an error.
    }

    return 'loaded';
  } catch (error) {
    if (!isCurrent()) return 'stale';
    onPageError(error);
    onVisibleSettled();
    return 'failed';
  }
}
