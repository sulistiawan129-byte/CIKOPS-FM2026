-- ════════════════════════════════════════════════════════════════
--  SECURITY DESK — DATA TAMBAHAN LAPORAN + SINKRON KE CIKOPS
--  Jalankan SEKALI di Supabase → SQL Editor, SETELAH schema.sql,
--  gate_module.sql, akses_akun.sql dan merger_gc.sql. Aman dijalankan ulang.
--
--  Yang ditambahkan (tabel lama tidak diubah):
--   1. security.daily_extra    per hari: kendaraan timbang, non-timbang,
--                              suplai sekam, buang abu (biomas PT Becis)
--   2. security.monthly_extra  per bulan: selisih timbang ≥ 40 kg, dari
--                              kendaraan Palm Oil/Fat Blend, kunjungan team
--                              support pengamanan (+ catatan)
--   3. security.area_issues    issue area: tanggal, jenis, deskripsi, Open/Close
--   4. security.cikops_report  satu fungsi baca-saja untuk CIKOPS (FM):
--                              semua angka satu bulan dalam satu panggilan
-- ════════════════════════════════════════════════════════════════

-- ── 1. Data harian tambahan ─────────────────────────────────────
create table if not exists security.daily_extra (
  site_id     uuid not null references security.sites(id) on delete cascade,
  day         date not null,
  category    text not null check (category in ('timbang','non_timbang','sekam','abu')),
  value       integer not null default 0 check (value >= 0),
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (site_id, day, category)
);

-- ── 2. Data bulanan tambahan ────────────────────────────────────
create table if not exists security.monthly_extra (
  site_id          uuid not null references security.sites(id) on delete cascade,
  month            date not null,
  selisih_timbang  integer not null default 0 check (selisih_timbang >= 0),
  palm_oil         integer not null default 0 check (palm_oil >= 0),
  team             jsonb not null default '{}',   -- {"Team G":2,"External":1,"Lingkungan":0,"G4S":3}
  team_note        text not null default '',
  updated_at       timestamptz not null default now(),
  primary key (site_id, month)
);

-- ── 3. Issue area ───────────────────────────────────────────────
create table if not exists security.area_issues (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references security.sites(id) on delete cascade,
  day         date not null,
  category    text not null default 'Security Issue',
  description text not null default '',
  status      text not null default 'Open' check (status in ('Open','Close')),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists area_issues_site_day on security.area_issues(site_id, day);

-- ── Jejak perubahan, updated_at, RLS, realtime (sama dengan tabel lain) ──
do $$
declare t text;
begin
  foreach t in array array['daily_extra','monthly_extra','area_issues'] loop
    execute format('drop trigger if exists trg_log_%1$s on security.%1$s', t);
    execute format('create trigger trg_log_%1$s after insert or update or delete on security.%1$s for each row execute function security.log_activity()', t);
    execute format('drop trigger if exists trg_touch_%1$s on security.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on security.%1$s for each row execute function security.touch_updated_at()', t);

    execute format('alter table security.%I enable row level security', t);
    execute format('drop policy if exists %1$s_read on security.%1$s', t);
    execute format('create policy %1$s_read on security.%1$s for select to authenticated using (security.has_site(site_id))', t);
    execute format('drop policy if exists %1$s_ins on security.%1$s', t);
    execute format('create policy %1$s_ins on security.%1$s for insert to authenticated with check (security.can_write(site_id))', t);
    execute format('drop policy if exists %1$s_upd on security.%1$s', t);
    execute format('create policy %1$s_upd on security.%1$s for update to authenticated using (security.can_write(site_id)) with check (security.can_write(site_id))', t);
    execute format('drop policy if exists %1$s_del on security.%1$s', t);
    execute format('create policy %1$s_del on security.%1$s for delete to authenticated using (security.can_write(site_id))', t);

    begin
      execute format('alter publication supabase_realtime add table security.%I', t);
    exception when duplicate_object then null;
    end;
    execute format('alter table security.%I replica identity full', t);
  end loop;
end $$;

grant select, insert, update, delete on security.daily_extra, security.monthly_extra, security.area_issues to authenticated;
grant all on security.daily_extra, security.monthly_extra, security.area_issues to service_role;

-- ── 4. Laporan satu bulan untuk CIKOPS ──────────────────────────
--  Dipanggil oleh server CIKOPS dengan akun baca-saja (peran Management
--  atau GA Department). security invoker = tetap patuh RLS: akun tanpa akses
--  site hanya mendapat data kosong.
--  p_month: tanggal mana pun di bulan itu. p_site: kode site (default CIK).
create or replace function security.cikops_report(p_month date, p_site text default 'CIK')
returns jsonb
language plpgsql stable security invoker set search_path = security as $$
declare
  m0 date := date_trunc('month', p_month)::date;
  m1 date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  sid uuid; sname text; scode text; plant text;
  tz text := 'Asia/Jakarta';
  out jsonb;
begin
  select id, name, code, coalesce(gc_plant, name) into sid, sname, scode, plant
    from sites where upper(code) = upper(coalesce(nullif(p_site, ''), 'CIK')) limit 1;
  if sid is null then
    raise exception 'Site % tidak ditemukan atau akun ini tidak punya akses Security Desk.', p_site;
  end if;

  select jsonb_build_object(
    'version', 1,
    'site', jsonb_build_object('code', scode, 'name', sname, 'plant', plant),
    'month', to_char(m0, 'YYYY-MM'),
    'generated_at', to_char(now() at time zone tz, 'YYYY-MM-DD"T"HH24:MI:SS'),

    -- per hari: kategori bawaan + tambahan → [{d:"2026-10-01", c:"karyawan", v:120}, ...]
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('d', to_char(x.day, 'YYYY-MM-DD'), 'c', x.category, 'v', x.value) order by x.day, x.category)
      from (
        select day, category, value from daily_counts where site_id = sid and day between m0 and m1
        union all
        select day, category, value from daily_extra where site_id = sid and day between m0 and m1
      ) x), '[]'::jsonb),

    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'value', value, 'note', note) order by category)
      from incident_counts where site_id = sid and month = m0), '[]'::jsonb),

    'patrol', (
      select jsonb_build_object('target_patrol', target_patrol, 'actual_patrol', actual_patrol,
               'target_checkpoint', target_checkpoint, 'actual_checkpoint', actual_checkpoint, 'note', note)
      from patrol_monthly where site_id = sid and month = m0),

    'extra', (
      select jsonb_build_object('selisih_timbang', selisih_timbang, 'palm_oil', palm_oil, 'team', team, 'team_note', team_note)
      from monthly_extra where site_id = sid and month = m0),

    'issues', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'category', category, 'description', description, 'status', status) order by day, created_at)
      from area_issues where site_id = sid and day between m0 and m1), '[]'::jsonb),

    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'date_text', date_text, 'type', type, 'backup', backup) order by created_at)
      from leaves where site_id = sid and month = m0), '[]'::jsonb),

    -- need improvement: semua yang masih berjalan + yang dibuka s/d bulan ini
    'improvements', coalesce((
      select jsonb_agg(jsonb_build_object('opened_month', to_char(opened_month, 'YYYY-MM'), 'description', description,
               'priority', priority, 'progress', progress, 'status', status) order by opened_month, id)
      from improvements where site_id = sid and opened_month <= m1), '[]'::jsonb),

    -- KPI tahun berjalan: [{m:1, o:1, s:5}, ...]
    'kpi', coalesce((
      select jsonb_agg(jsonb_build_object('m', month, 'o', objective, 's', score) order by month, objective)
      from kpi_scores where site_id = sid and year = extract(year from m0)::int and score is not null), '[]'::jsonb),

    -- gate transporter bulan ini + kondisi saat ini
    'gate', jsonb_build_object(
      'days', coalesce((
        select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d)
        from (select to_char((in_at at time zone tz)::date, 'YYYY-MM-DD') d, count(*)::int n
              from gate_inspections where site_id = sid and (in_at at time zone tz)::date between m0 and m1 group by 1) g), '[]'::jsonb),
      'total_in', (select count(*)::int from gate_inspections where site_id = sid and (in_at at time zone tz)::date between m0 and m1),
      'total_out', (select count(*)::int from gate_inspections where site_id = sid and status = 'out' and (in_at at time zone tz)::date between m0 and m1),
      'with_findings', (select count(*)::int from gate_inspections where site_id = sid and finding_count > 0 and (in_at at time zone tz)::date between m0 and m1),
      'avg_minutes', (select round(avg(extract(epoch from (out_at - in_at)) / 60))::int from gate_inspections
                       where site_id = sid and out_at is not null and (in_at at time zone tz)::date between m0 and m1),
      'inside_now', (select count(*)::int from gate_inspections where site_id = sid and status = 'in'),
      'over_4h', (select count(*)::int from gate_inspections where site_id = sid and status = 'in' and in_at < now() - interval '4 hours'),
      'top_companies', coalesce((
        select jsonb_agg(jsonb_build_object('name', company_name, 'n', n) order by n desc)
        from (select company_name, count(*)::int n from gate_inspections
              where site_id = sid and (in_at at time zone tz)::date between m0 and m1 and company_name <> ''
              group by 1 order by 2 desc limit 8) t), '[]'::jsonb)
    )
  ) into out;
  return out;
end $$;

grant execute on function security.cikops_report(date, text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
--  AKUN BACA UNTUK CIKOPS
--  Server CIKOPS memakai akun GC_READER_EMAIL (sudah dipakai untuk data NC).
--  Pastikan akun itu punya akses Security Desk dengan peran Management
--  (lihat saja). Ganti email lalu jalankan:
--
--  insert into security.profiles (id, email, full_name, role, active)
--  select id, email, 'CIKOPS (baca)', 'management', true
--  from auth.users where email = 'email-akun-cikops@contoh.com'
--  on conflict (id) do update set role = 'management', active = true;
-- ════════════════════════════════════════════════════════════════
