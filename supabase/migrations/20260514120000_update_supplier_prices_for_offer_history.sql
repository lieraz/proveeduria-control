-- Reuse supplier_prices for historical supplier offer pricing.
-- This intentionally does not create supplier_item_prices.

alter table public.supplier_prices
  add column if not exists item_description text,
  add column if not exists source_offer_id uuid,
  add column if not exists currency text not null default 'MXN';

update public.supplier_prices
set currency = 'MXN'
where currency is null or trim(currency) = '';

alter table public.supplier_prices
  alter column product_id drop not null,
  alter column currency set default 'MXN',
  alter column currency set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_prices_currency_not_blank'
      and conrelid = 'public.supplier_prices'::regclass
  ) then
    alter table public.supplier_prices
      add constraint supplier_prices_currency_not_blank
      check (length(trim(currency)) > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_prices_source_offer_id_fkey'
      and conrelid = 'public.supplier_prices'::regclass
  ) then
    alter table public.supplier_prices
      add constraint supplier_prices_source_offer_id_fkey
      foreign key (source_offer_id)
      references public.supplier_offers(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists supplier_prices_source_offer_id_key
  on public.supplier_prices(source_offer_id);

create or replace function public.sync_supplier_price_from_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_line record;
begin
  select
    crl.product_id,
    crl.unit,
    crl.description
  into request_line
  from public.client_request_lines as crl
  where crl.id = new.client_request_line_id;

  insert into public.supplier_prices (
    company_id,
    product_id,
    supplier_id,
    quoted_at,
    cost,
    unit,
    valid_until,
    notes,
    item_description,
    source_offer_id,
    active,
    currency
  )
  values (
    new.company_id,
    request_line.product_id,
    new.supplier_id,
    current_date,
    new.unit_price,
    request_line.unit,
    new.valid_until,
    new.notes,
    coalesce(nullif(trim(new.supplier_description), ''), request_line.description),
    new.id,
    true,
    coalesce(nullif(trim(new.currency), ''), 'MXN')
  )
  on conflict (source_offer_id) do update
  set
    company_id = excluded.company_id,
    product_id = excluded.product_id,
    supplier_id = excluded.supplier_id,
    quoted_at = excluded.quoted_at,
    cost = excluded.cost,
    unit = excluded.unit,
    valid_until = excluded.valid_until,
    notes = excluded.notes,
    item_description = excluded.item_description,
    active = true,
    currency = excluded.currency;

  return new;
end;
$$;

drop trigger if exists sync_supplier_price_from_offer on public.supplier_offers;

create trigger sync_supplier_price_from_offer
after insert or update on public.supplier_offers
for each row
execute function public.sync_supplier_price_from_offer();
