create extension if not exists pgcrypto;

create table if not exists public.audit_leads (
  id uuid primary key default gen_random_uuid(),
  restaurant_name text not null,
  city text not null,
  email text not null,
  source text not null default 'homepage',
  created_at timestamptz not null default now()
);

create index if not exists audit_leads_created_at_idx
  on public.audit_leads (created_at desc);

create index if not exists audit_leads_email_idx
  on public.audit_leads (email);
