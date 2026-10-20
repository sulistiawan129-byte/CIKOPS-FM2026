-- ═══════════════════════════════════════════════════════════════
-- 035 — TGA: Requestor tersinkron dengan Data Karyawan
--
-- • tga_activities.requestor_id → employees(id). Requestor dipilih dari
--   Data Karyawan (menu Receptionist → Data Master, atau tabel employees).
--   Nama & departemen diambil dari data karyawan, bukan ketikan bebas.
-- • Data karyawan diubah (nama / departemen) → kegiatan TGA yang terhubung
--   ikut diperbarui otomatis. Karyawan dihapus → kegiatan tetap ada, namanya tetap.
-- • Kegiatan lama dihubungkan otomatis bila namanya persis sama dengan
--   satu karyawan.
-- • Requestor di luar data karyawan (tamu / vendor) tetap boleh, ditandai
--   "di luar data karyawan".
--
-- Idempotent — aman dijalankan ulang. Jalankan SESUDAH 034.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Kolom penghubung ──
alter table tga_activities add column if not exists requestor_id uuid references employees(id) on delete set null;
create index if not exists tga_activities_requestor_idx on tga_activities (requestor_id);

-- Hubungkan kegiatan lama yang namanya cocok dengan tepat satu karyawan.
update tga_activities a set requestor_id = m.id
  from (select lower(trim(nama)) as k, (array_agg(id))[1] as id from employees group by 1 having count(*) = 1) m
 where a.requestor_id is null and coalesce(trim(a.request_by), '') <> '' and lower(trim(a.request_by)) = m.k;

-- ── 2) JSON kegiatan kini membawa requestor_id ──
create or replace function tga_activity_json(a tga_activities) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'ref_no', a.ref_no, 'nama_tga', a.nama_tga, 'tanggal', a.tanggal,
    'jam_mulai', to_char(a.jam_mulai, 'HH24:MI'), 'jam_selesai', to_char(a.jam_selesai, 'HH24:MI'),
    'kategori', a.kategori, 'lokasi', a.lokasi, 'activity', a.activity, 'request_by', a.request_by,
    'requestor_id', a.requestor_id,
    'departemen', a.departemen, 'status', a.status, 'prioritas', a.prioritas, 'catatan', a.catatan,
    'selesai_at', a.selesai_at, 'created_at', a.created_at, 'updated_at', a.updated_at)
$$;

-- ── 3) Daftar karyawan untuk aplikasi (id, nama, NIK, departemen, jabatan) ──
create or replace function tga_requestors(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform tga_user_of(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nama', e.nama, 'dept', coalesce(e.departement, ''),
      'nik', coalesce(e.nik, ''), 'jabatan', coalesce(to_jsonb(e) ->> 'jabatan', '')) order by e.nama)
    from employees e
   where coalesce(trim(e.nama), '') <> '' and coalesce((to_jsonb(e) ->> 'aktif')::boolean, true)), '[]'::jsonb);
end $$;

-- ── 4) Simpan kegiatan: requestor_id → nama & departemen dari Data Karyawan ──
create or replace function tga_save_activity(p_token text, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u tga_users%rowtype; a tga_activities%rowtype; v_status text; v_act text;
        v_req_id uuid; v_req text; v_dept text;
begin
  u := tga_user_of(p_token);
  v_act := trim(coalesce(p_data->>'activity', ''));
  if v_act = '' then raise exception 'Isi kegiatan yang dikerjakan.'; end if;
  v_status := coalesce(nullif(p_data->>'status', ''), 'selesai');

  v_req := trim(coalesce(p_data->>'request_by', ''));
  v_dept := trim(coalesce(p_data->>'departemen', ''));
  if coalesce(p_data->>'requestor_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select e.id, e.nama, coalesce(nullif(trim(e.departement), ''), v_dept)
      into v_req_id, v_req, v_dept
      from employees e where e.id = (p_data->>'requestor_id')::uuid;
    if v_req_id is null then raise exception 'Karyawan requestor tidak ditemukan — pilih ulang dari daftar.'; end if;
  end if;

  if p_id is null then
    insert into tga_activities (ref_no, user_id, nama_tga, tanggal, jam_mulai, jam_selesai, kategori, lokasi, activity,
                                request_by, requestor_id, departemen, status, prioritas, catatan, selesai_at)
    values (tga_next_no(), u.id, u.nama,
            coalesce(nullif(p_data->>'tanggal', '')::date, (now() at time zone 'Asia/Jakarta')::date),
            nullif(p_data->>'jam_mulai', '')::time, nullif(p_data->>'jam_selesai', '')::time,
            coalesce(nullif(trim(p_data->>'kategori'), ''), 'Lainnya'), trim(coalesce(p_data->>'lokasi', '')), v_act,
            v_req, v_req_id, v_dept, v_status,
            coalesce(nullif(p_data->>'prioritas', ''), 'normal'), trim(coalesce(p_data->>'catatan', '')),
            case when v_status = 'selesai' then now() end)
    returning * into a;
  else
    update tga_activities set
      tanggal = coalesce(nullif(p_data->>'tanggal', '')::date, tanggal),
      jam_mulai = nullif(p_data->>'jam_mulai', '')::time, jam_selesai = nullif(p_data->>'jam_selesai', '')::time,
      kategori = coalesce(nullif(trim(p_data->>'kategori'), ''), kategori), lokasi = trim(coalesce(p_data->>'lokasi', '')),
      activity = v_act, request_by = v_req, requestor_id = v_req_id, departemen = v_dept,
      status = v_status, prioritas = coalesce(nullif(p_data->>'prioritas', ''), prioritas), catatan = trim(coalesce(p_data->>'catatan', '')),
      selesai_at = case when v_status = 'selesai' then coalesce(selesai_at, now()) else null end, updated_at = now()
     where id = p_id and user_id = u.id
    returning * into a;
    if not found then raise exception 'Kegiatan tidak ditemukan.'; end if;
  end if;
  return tga_activity_json(a);
end $$;

-- ── 5) Data karyawan berubah → kegiatan TGA yang terhubung ikut diperbarui ──
create or replace function tga_sync_requestor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tga_activities
     set request_by = new.nama,
         departemen = coalesce(nullif(trim(new.departement), ''), departemen)
   where requestor_id = new.id
     and (request_by is distinct from new.nama or departemen is distinct from coalesce(nullif(trim(new.departement), ''), departemen));
  return new;
end $$;
drop trigger if exists tga_sync_requestor on employees;
create trigger tga_sync_requestor after update of nama, departement on employees
  for each row execute function tga_sync_requestor();

-- Hak akses (tga_save_activity & tga_requestors tetap untuk aplikasi tanpa login Supabase)
revoke all on function tga_save_activity(text, uuid, jsonb) from public;
grant execute on function tga_save_activity(text, uuid, jsonb) to anon, authenticated;
revoke all on function tga_requestors(text) from public;
grant execute on function tga_requestors(text) to anon, authenticated;
revoke all on function tga_sync_requestor() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ── 6) Cek hasil ──
select 'kegiatan TGA terhubung ke karyawan' as cek, count(*)::text as hasil from tga_activities where requestor_id is not null
union all select 'kegiatan TGA requestor di luar data karyawan', count(*)::text from tga_activities where requestor_id is null and coalesce(request_by, '') <> ''
union all select 'karyawan aktif (pilihan requestor)', count(*)::text from employees e where coalesce((to_jsonb(e) ->> 'aktif')::boolean, true);
