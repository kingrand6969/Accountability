export type RelationshipStatus =
  | 'single'
  | 'in_relationship'
  | 'married'
  | 'divorced'
  | 'separated'
  | 'prefer_not_to_say';

export type Gender = 'male' | 'female';

export type SexualOrientation =
  | 'male'
  | 'female'
  | 'gay'
  | 'lesbian'
  | 'prefer_not_to_say';

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null; // 'YYYY-MM-DD'
  birthday_private: boolean;
  relationship_status: RelationshipStatus | null;
  gender: Gender | null;
  gender_private: boolean;
  sexual_orientation: SexualOrientation | null;
  sexual_orientation_private: boolean;
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
    | 'gender'
    | 'gender_private'
    | 'sexual_orientation'
    | 'sexual_orientation_private'
    | 'area'
    | 'show_last_active'
  >
>;
