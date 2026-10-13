-- ═══════════════════════════════════════════════════════════════
-- 025 — Kalender & Agenda: jenis agenda, jam selesai, PIC, catatan,
--       tautan ke penugasan driver, dan izin UBAH (update).
--
-- Aman dijalankan ulang. Data agenda lama tetap ada (jenis = "event").
-- ═══════════════════════════════════════════════════════════════

-- 1) Tabel (dibuat hanya bila belum ada — biasanya sudah ada)
create table if not exists agenda_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  location    text default '',
  event_date  date not null,
  event_time  text default '',
  color       text default 'blue',
  created_by  text default '',
  created_at  timestamptz not null default now()
);

-- 2) Kolom baru
alter table agenda_events add column if not exists kategori   text not null default 'event';
alter table agenda_events add column if not exists end_time   text default '';
alter table agenda_events add column if not exists notes      text default '';
alter table agenda_events add column if not exists pic        text default '';
alter table agenda_events add column if not exists task_id    uuid references tasks(id) on delete set null;
alter table agenda_events add column if not exists updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_events_kategori_chk') then
    alter table agenda_events add constraint agenda_events_kategori_chk
      check (kategori in ('kunjungan','event','meeting','pelatihan','libur','lainnya'));
  end if;
end $$;

create index if not exists agenda_events_date_idx on agenda_events (event_date);
create index if not exists agenda_events_task_idx on agenda_events (task_id) where task_id is not null;

-- 3) Izin (RLS): semua akun yang login (punya profil) boleh lihat/tambah/ubah/hapus.
--    Kebijakan lama yang sudah ada tidak dihapus; yang belum ada ditambahkan.
alter table agenda_events enable row level security;

do $$
declare
  c text;
begin
  foreach c in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'agenda_events' and cmd in (c, 'ALL')
    ) then
      if c = 'INSERT' then
        execute format('create policy "agenda_%s" on agenda_events for insert to authenticated with check (exists (select 1 from profiles where id = auth.uid()))', lower(c));
      elsif c = 'UPDATE' then
        execute format('create policy "agenda_%s" on agenda_events for update to authenticated using (exists (select 1 from profiles where id = auth.uid())) with check (exists (select 1 from profiles where id = auth.uid()))', lower(c));
      else
        execute format('create policy "agenda_%s" on agenda_events for %s to authenticated using (exists (select 1 from profiles where id = auth.uid()))', lower(c), lower(c));
      end if;
      raise notice 'Kebijakan % ditambahkan', c;
    end if;
  end loop;
end $$;

-- 4) Cek hasil
select 'kolom' as cek, string_agg(column_name, ', ' order by ordinal_position) as hasil
from information_schema.columns where table_schema = 'public' and table_name = 'agenda_events'
union all
select 'kebijakan', string_agg(policyname || ' (' || cmd || ')', ', ')
from pg_policies where schemaname = 'public' and tablename = 'agenda_events'
union all
select 'jumlah agenda', count(*)::text from agenda_events;
