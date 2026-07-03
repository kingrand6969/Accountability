export type TimelineType =
  | 'event'
  | 'task'
  | 'workout'
  | 'meal'
  | 'expense'
  | 'income'
  | 'activity';

export type ChecklistItem = { text: string; done: boolean };

export type TimelineItem = {
  id: string;
  user_id: string;
  type: TimelineType;
  title: string;
  note: string | null;
  checklist: ChecklistItem[] | null;
  starts_at: string; // ISO timestamp
  reminder_id: string | null;
  created_at: string;
};

export type NewTimelineItem = {
  type: TimelineType;
  title: string;
  note?: string | null;
  checklist?: ChecklistItem[] | null;
  starts_at: string; // ISO timestamp
  reminder_id?: string | null;
};
