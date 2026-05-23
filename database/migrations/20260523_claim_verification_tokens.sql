create extension if not exists pgcrypto;

create table if not exists public.claim_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists claim_verification_tokens_restaurant_idx
  on public.claim_verification_tokens (restaurant_id, created_at desc);

create index if not exists claim_verification_tokens_active_idx
  on public.claim_verification_tokens (restaurant_id, token_hash)
  where used_at is null;
