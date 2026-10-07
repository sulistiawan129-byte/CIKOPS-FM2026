-- ═══════════════════════════════════════════════════════════════
-- 017 — Penugasan: kolom "Lokasi Keberangkatan / Penjemputan" (Dari mana → kemana)
--
-- • tasks.lokasi_asal  : titik berangkat / jemput. Tujuan tetap di tasks.tujuan.
-- • Data lama          : diisi otomatis sesuai plant tugasnya
--                        (CIK → "Plant Cikarang", PRB → "Plant Pasar Rebo").
-- • Data baru          : diisi dari form; kalau kosong, default sesuai plant.
-- • get_task_origins   : dibaca aplikasi (dashboard & driver) tanpa mengubah
--                        view tasks_detail (definisi view di produksi tidak disentuh).
-- • set_task_origin_batch : mengisi lokasi asal untuk penugasan rentang tanggal
--                        (create_task_batch tidak diubah).
-- Aman dijalankan ulang (idempotent).
-- ═══════════════════════════════════════════════════════════════

alter table tasks add column if not exists lokasi_asal text;

-- 1) Isi data lama sesuai plant
update tasks
   set lokasi_asal = case plant
                       when 'CIK' then 'Plant Cikarang'
                       when 'PRB' then 'Plant Pasar Rebo'
                       else lokasi_asal
                     end
 where lokasi_asal is null or btrim(lokasi_asal) = '';

-- 2) Baris baru tanpa lokasi asal otomatis memakai lokasi plant-nya
create or replace function tasks_default_origin()
returns trigger
language plpgsql
as $$
begin
  if new.lokasi_asal is null or btrim(new.lokasi_asal) = '' then
    new.lokasi_asal := case new.plant
                         when 'CIK' then 'Plant Cikarang'
                         when 'PRB' then 'Plant Pasar Rebo'
                         else null
                       end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_default_origin on tasks;
create trigger trg_tasks_default_origin
  before insert on tasks
  for each row execute function tasks_default_origin();

-- 3) Baca lokasi asal untuk sekumpulan tugas (id saja, tanpa data lain)
create or replace function get_task_origins(p_ids uuid[])
returns table (id uuid, lokasi_asal text)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.lokasi_asal from tasks t where t.id = any(p_ids);
$$;

revoke all on function get_task_origins(uuid[]) from public;
grant execute on function get_task_origins(uuid[]) to anon, authenticated;

-- 4) Isi lokasi asal untuk satu batch (penugasan rentang tanggal) — hanya staf login
create or replace function set_task_origin_batch(p_batch_id uuid, p_asal text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update tasks set lokasi_asal = nullif(btrim(p_asal), '') where batch_id = p_batch_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function set_task_origin_batch(uuid, text) from public;
grant execute on function set_task_origin_batch(uuid, text) to authenticated;
