-- ═══════════════════════════════════════════════════════════════
-- 014 — Tipe driver: Operational vs User
--   operational : driver yang ditugaskan untuk penugasan operasional
--   user        : driver pribadi/dedicated untuk seorang "user"
--                 (mis. direksi). Otomatis ON DUTY 08.00–16.30 WIB setiap
--                 hari; statusnya terkunci dan tidak ikut penugasan.
-- JALANKAN SEKALI di Supabase → SQL Editor, SEBELUM deploy kode baru.
-- Aman dijalankan ulang (idempotent).
-- ═══════════════════════════════════════════════════════════════

alter table drivers add column if not exists driver_type text not null default 'operational';
alter table drivers add column if not exists assigned_user text;        -- nama user yang diantar
alter table drivers add column if not exists assigned_user_title text;  -- jabatan / keterangan (opsional)

alter table drivers drop constraint if exists drivers_driver_type_check;
alter table drivers add constraint drivers_driver_type_check
  check (driver_type in ('operational', 'user'));

comment on column drivers.driver_type is 'operational | user. Driver user = On Duty otomatis 08.00–16.30 WIB, status terkunci.';
comment on column drivers.assigned_user is 'Nama user yang diantar oleh driver bertipe user.';

-- Dipakai aplikasi driver (sesi login driver tidak selalu bisa SELECT langsung
-- ke tabel drivers karena RLS — pola sama dengan get_driver_by_email).
create or replace function get_driver_duty_info(p_driver_id uuid)
returns table (driver_type text, assigned_user text, assigned_user_title text)
language sql
security definer
set search_path = public
as $$
  select d.driver_type, d.assigned_user, d.assigned_user_title
  from drivers d
  where d.id = p_driver_id;
$$;
grant execute on function get_driver_duty_info(uuid) to authenticated, anon;

-- Driver User tidak boleh ditugaskan ke penugasan operasional
-- (statusnya On Duty terkunci). Hanya memblokir penugasan BARU / pergantian driver.
create or replace function block_user_driver_tasks()
returns trigger
language plpgsql
as $$
begin
  if new.driver_id is not null
     and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id)
     and exists (select 1 from drivers d where d.id = new.driver_id and d.driver_type = 'user')
  then
    raise exception 'Driver User berstatus On Duty (08.00–16.30) dan tidak dapat ditugaskan ke penugasan operasional.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_user_driver_tasks on tasks;
create trigger trg_block_user_driver_tasks
  before insert or update of driver_id on tasks
  for each row execute function block_user_driver_tasks();
