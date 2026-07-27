export type PostAudience = 'buddies' | 'public' | 'group';
export type PostType =
  | 'post'
  | 'photo'
  | 'run'
  | 'workout'
  | 'milestone'
  | 'event'
  | 'memory'
  | 'savings';

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
  audience: PostAudience;
  post_type: PostType;
  share_data: Record<string, unknown>;
  activity_id: string | null;
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
