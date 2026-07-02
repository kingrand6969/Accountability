-- Enable Supabase Realtime for buddy chat (INSERT events stream to clients;
-- RLS still applies to what each subscriber may see).
alter publication supabase_realtime add table public.buddy_messages;
