export type TimelineType =
  | 'event'
  | 'task'
  | 'workout'
  | 'meal'
  | 'expense'
  | 'activity';

export type TimelineItem = {
  id: string;
  user_id: string;
  type: TimelineType;
  title: string;
  note: string | null;
  starts_at: string; // ISO timestamp
  created_at: string;
};

export type NewTimelineItem = {
  type: TimelineType;
  title: string;
  note?: string | null;
  starts_at: string; // ISO timestamp
};
