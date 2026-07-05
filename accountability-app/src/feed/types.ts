export type FeedPost = {
  id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  tagged: { id: string; name: string | null }[];
  event: {
    id: string;
    title: string;
    starts_at: string;
    location: string | null;
    group_id: string;
  } | null;
};

export type PostComment = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
};
