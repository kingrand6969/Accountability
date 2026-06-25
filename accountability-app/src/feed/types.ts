export type FeedPost = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

export type PostComment = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
};
