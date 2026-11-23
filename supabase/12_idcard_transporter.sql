-- ═════════════════════════════════════════════════
-- 12_IDCARD_TRANSPORTER — jenis kartu keempat: TRANSPORTER (kode "R").
--   • Nomor kartu = urutan polos 1, 2, 3 … (tidak ada tanggal, tidak kembali ke 1 tiap hari). Di kartu ditampilkan besar di tengah;
--     nomor seri (TRP-DDMMYY-###) dan tanggal cetak dibuat saat kartu dicetak.
--   • Desain kartu dipisah: baris id=1 untuk Temporary/Contractor/Outsourcing, baris id=2 untuk Transporter.
--
-- Jalankan SESUDAH 11_idcard.sql di Supabase SQL Editor. Idempotent — aman diulang.
-- ═════════════════════════════════════════════════

-- ── 1. Jenis "R" diizinkan di semua tabel ID Card ─────────────────────────────────────
do $$
declare t text; c record;
begin
  foreach t in array array['idcard_requests', 'idcard_handovers', 'idcards'] loop
    for c in select con.conname from pg_constraint con
              where con.conrelid = to_regclass('public.' || t) and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%tipe%'
    loop
      execute format('alter table %I drop constraint %I', t, c.conname);
    end loop;
    execute format('alter table %I add constraint %I check (tipe in (''T'', ''C'', ''O'', ''R''))', t, t || '_tipe_check');
  end loop;

  -- penghitung: deret baru "TR"
  for c in select con.conname from pg_constraint con
            where con.conrelid = 'public.idcard_counters'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%series%'
  loop
    execute format('alter table idcard_counters drop constraint %I', c.conname);
  end loop;
  alter table idcard_counters add constraint idcard_counters_series_check check (series in ('T', 'CO', 'TR'));

  -- desain: dua baris (1 = umum, 2 = Transporter)
  for c in select con.conname from pg_constraint con
            where con.conrelid = 'public.idcard_settings'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%id%'
  loop
    execute format('alter table idcard_settings drop constraint %I', c.conname);
  end loop;
  alter table idcard_settings add constraint idcard_settings_id_check check (id in (1, 2));
end $$;

-- ── 2. Fungsi (menggantikan versi di file 11) ─────────────────────────────────────────
create or replace function idcard_format(p_tipe text, p_day date, p_seq integer) returns text
language sql immutable as $$
  select case p_tipe
           when 'R' then p_seq::text                                        -- Transporter: nomor urut polos (1, 2, 3 …)
           when 'T' then 'T-' || to_char(p_day, 'DDMMYY') || lpad(p_seq::text, 3, '0')
           else to_char(p_day, 'DDMMYY') || lpad(p_seq::text, 3, '0')
         end
$$;

create or replace function idcard_create_request(
  p_tanggal date, p_perusahaan text, p_pic text, p_phone text, p_tipe text, p_lokasi text, p_jumlah integer, p_catatan text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_day date := case when p_tipe = 'R' then date '2000-01-01' else (now() at time zone 'Asia/Jakarta')::date end;   -- Transporter: urutan berlanjut, tidak kembali ke 1 tiap hari
  v_series text := case p_tipe when 'T' then 'T' when 'R' then 'TR' else 'CO' end;
  v_last integer; v_start integer; v_id uuid;
begin
  perform idcard_guard();
  if p_tipe not in ('T', 'C', 'O', 'R') then raise exception 'Jenis kartu tidak valid.'; end if;
  if btrim(coalesce(p_perusahaan, '')) = '' then raise exception 'Nama perusahaan harus diisi.'; end if;
  if btrim(coalesce(p_pic, '')) = '' then raise exception 'Nama PIC harus diisi.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 500 then raise exception 'Jumlah harus antara 1–500.'; end if;

  insert into idcard_counters (day, series, last_seq) values (v_day, v_series, p_jumlah)
  on conflict (day, series) do update set last_seq = idcard_counters.last_seq + p_jumlah
  returning last_seq into v_last;
  v_start := v_last - p_jumlah + 1;

  insert into idcard_requests (tanggal, perusahaan, pic, phone, tipe, lokasi, jumlah, card_from, card_to, catatan, created_by)
  values (coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), left(btrim(p_perusahaan), 120), left(btrim(p_pic), 80), left(btrim(coalesce(p_phone, '')), 30), p_tipe,
          upper(left(coalesce(nullif(btrim(p_lokasi), ''), 'CIKARANG'), 40)), p_jumlah,
          idcard_format(p_tipe, v_day, v_start), idcard_format(p_tipe, v_day, v_last), left(btrim(coalesce(p_catatan, '')), 500), idcard_actor())
  returning id into v_id;

  insert into idcards (request_id, number, tipe)
  select v_id, idcard_format(p_tipe, v_day, g), p_tipe from generate_series(v_start, v_last) g;
  return v_id;
end $$;

create or replace function idcard_create_handover(
  p_tanggal date, p_perusahaan text, p_pic text, p_phone text, p_jabatan text, p_tipe text,
  p_card_from text, p_card_to text, p_jumlah integer, p_catatan text, p_request_id uuid, p_skip_validation boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_from idcards; v_to idcards; v_n integer; v_busy integer;
  v_from_txt text := upper(btrim(coalesce(p_card_from, '')));
  v_to_txt   text := upper(btrim(coalesce(p_card_to, '')));
  v_actor text := idcard_actor();
  v_jumlah integer := p_jumlah;
  v_req uuid;
begin
  perform idcard_guard();
  if p_tipe not in ('T', 'C', 'O', 'R') then raise exception 'Jenis kartu tidak valid.'; end if;
  if btrim(coalesce(p_perusahaan, '')) = '' then raise exception 'Nama perusahaan harus diisi.'; end if;
  if btrim(coalesce(p_pic, '')) = '' then raise exception 'Nama penerima harus diisi.'; end if;
  if v_from_txt = '' or v_to_txt = '' then raise exception 'Nomor kartu dari / sampai harus diisi.'; end if;

  if not coalesce(p_skip_validation, false) then
    select * into v_from from idcards where number = v_from_txt;
    select * into v_to   from idcards where number = v_to_txt;
    if v_from.id is null then raise exception 'Nomor % tidak ditemukan di data kartu yang diterbitkan. (Kartu lama? Centang "kartu lama di luar sistem".)', v_from_txt; end if;
    if v_to.id is null   then raise exception 'Nomor % tidak ditemukan di data kartu yang diterbitkan. (Kartu lama? Centang "kartu lama di luar sistem".)', v_to_txt; end if;
    if v_from.tipe <> p_tipe or v_to.tipe <> p_tipe then raise exception 'Jenis kartu pada nomor tidak sama dengan jenis yang dipilih.'; end if;
    if v_from.ord > v_to.ord then raise exception 'Nomor "dari" harus lebih awal dari nomor "sampai".'; end if;
    select count(*), count(*) filter (where status <> 'diterbitkan') into v_n, v_busy
      from idcards where tipe = p_tipe and ord between v_from.ord and v_to.ord;
    if v_busy > 0 then raise exception '% dari % kartu dalam rentang ini tidak berstatus "diterbitkan" (sudah diserahkan / kembali / hilang).', v_busy, v_n; end if;
    v_jumlah := v_n;
  else
    if v_jumlah is null or v_jumlah < 1 or v_jumlah > 999 then raise exception 'Jumlah harus antara 1–999.'; end if;
  end if;

  insert into idcard_handovers (id, tanggal, perusahaan, pic, phone, jabatan, tipe, jumlah, card_from, card_to, catatan, request_id, validated, created_by)
  values (v_id, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), left(btrim(p_perusahaan), 120), left(btrim(p_pic), 80), left(btrim(coalesce(p_phone, '')), 30),
          left(btrim(coalesce(p_jabatan, '')), 60), p_tipe, v_jumlah, v_from_txt, v_to_txt, left(btrim(coalesce(p_catatan, '')), 500), p_request_id,
          not coalesce(p_skip_validation, false), v_actor);

  if not coalesce(p_skip_validation, false) then
    update idcards set status = 'diserahkan', handover_id = v_id, handed_at = coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), updated_at = now()
     where tipe = p_tipe and ord between v_from.ord and v_to.ord;
    insert into idcard_card_logs (number, action, detail, actor)
    select number, 'serah', format('%s · %s', btrim(p_perusahaan), btrim(p_pic)), v_actor from idcards where handover_id = v_id;

    -- pengajuan yang kartunya sudah habis diserahkan → Selesai (yang diacu maupun semua pengajuan yang kartunya ikut terserahkan)
    for v_req in select distinct request_id from idcards where handover_id = v_id loop
      if not exists (select 1 from idcards where request_id = v_req and status = 'diterbitkan') then
        update idcard_requests set status = 'selesai' where id = v_req;
      end if;
    end loop;
  end if;
  return v_id;
end $$;

revoke all on function idcard_format(text, date, integer) from public, anon;
revoke all on function idcard_create_request(date, text, text, text, text, text, integer, text),
                       idcard_create_handover(date, text, text, text, text, text, text, text, integer, text, uuid, boolean) from public, anon;
grant execute on function idcard_create_request(date, text, text, text, text, text, integer, text),
                          idcard_create_handover(date, text, text, text, text, text, text, text, integer, text, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
select 'ok' as cek, (select count(*) from idcard_requests where tipe = 'R') as pengajuan_transporter;
