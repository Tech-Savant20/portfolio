-- Every contact form submission, kept alongside the email the Worker sends.
--
-- Row level security is on and no policies are granted, so the publishable
-- (anon) key and signed-in users can neither read nor write this table. The
-- only way in is a secret key, which lives as a Worker secret and never
-- reaches a browser.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  message text not null check (char_length(message) between 10 and 4000),
  -- Enough to tell spam from a real sender. No IP address is stored.
  country text,
  user_agent text,
  source text not null default 'abhyudaytomar.com'
);

alter table public.contact_messages enable row level security;

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
