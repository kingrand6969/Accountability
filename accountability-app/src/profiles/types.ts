export type RelationshipStatus =
  | 'single'
  | 'in_relationship'
  | 'prefer_not_to_say';

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null; // 'YYYY-MM-DD'
  birthday_private: boolean;
  relationship_status: RelationshipStatus | null;
  area: string | null;
  show_last_active: boolean;
  last_active_at: string | null;
  created_at: string;
};

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'bio'
    | 'birthday'
    | 'birthday_private'
    | 'relationship_status'
    | 'area'
    | 'show_last_active'
  >
>;
