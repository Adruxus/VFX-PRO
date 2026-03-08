create table if not exists public.billing_ledger_entries (
    id bigserial primary key,
    user_id text not null,
    timestamp timestamptz not null default now(),
    operation text not null,
    model_id text,
    provider text not null default 'unknown',
    credits numeric(18, 4) not null default 0,
    billed_usd numeric(18, 6) not null default 0,
    provider_reserve_usd numeric(18, 6) not null default 0,
    platform_profit_usd numeric(18, 6) not null default 0,
    charge_multiplier numeric(10, 4),
    configured_provider_cost_usd numeric(18, 6),
    model_tier text,
    provider_settlement_bucket text,
    platform_settlement_bucket text,
    metadata jsonb
);

create index if not exists idx_billing_ledger_entries_user_ts
    on public.billing_ledger_entries (user_id, timestamp desc);

create index if not exists idx_billing_ledger_entries_provider_ts
    on public.billing_ledger_entries (provider, timestamp desc);

alter table public.billing_ledger_entries enable row level security;
