export type User = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  avatar_url: string | null;
  unread_count?: number;
  is_online?: boolean;
  last_seen?: string;
  last_message_timestamp?: string;
  is_contact?: boolean;
  public_key?: string;
  email_verified?: boolean;
  circle_type?: 'normal' | 'dnd' | 'blacklist';
  is_blacklisted_by?: boolean;
};

export type Reaction = {
  id: string;
  emoji: string;
  user_id: string;
};

export type Group = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  creator_id: string;
  current_key_version?: number;
  created_at: string;
  member_count?: number;
  unread_count?: number;
  role?: string;
  encrypted_keys?: string;
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id?: string | null;
  group_id?: string | null;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  reply_to?: string | null;
  forwarded_from?: string | null;
  forwarded_from_username?: string | null;
  is_edited?: boolean;
  is_deleted?: boolean | number;
  created_at: string;
  reactions: Reaction[];
  sender_username?: string;
  sender_first_name?: string;
  sender_last_name?: string;
  sender_avatar_url?: string | null;
  encryption_data?: any; // E2EE data
  encrypted_content?: string;
};

export type Reminder = {
  id: string;
  user_id: string;
  chat_id: string;
  message_id: string;
  remind_at: string;
  is_pinned: boolean; // Deprecated
  is_dismissed?: boolean;
  comment?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  created_at: string;
  message?: Message;
};

export type PinnedMessage = {
  id: string;
  chat_id: string;
  message_id: string;
  pinned_by: string;
  created_at: string;
  message?: Message;
};
