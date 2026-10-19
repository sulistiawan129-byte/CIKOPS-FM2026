-- ═══════════════════════════════════════════════════════════════
-- 029 — FM COMMAND CENTER: kantin snack & makan TERPISAH
--
-- Memperbarui get_fm_snapshot() (028) supaya canteen_daily membawa angka
-- snack (so/sl) dan makan (mo/ml) per shift secara terpisah, sehingga layar
-- /dashboard-viewonly bisa menampilkan total & sisa masing-masing.
-- Kunci lama o/l (gabungan) tetap ada untuk kompatibilitas.
-- Bagian lain fungsi identik dengan 028.
--
-- Idempotent — aman dijalankan ulang. Jalankan SETELAH 028.
-- ═══════════════════════════════════════════════════════════════

create or replace function get_fm_snapshot()
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_m0    date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  r jsonb;
  x jsonb; y jsonb; z jsonb; w jsonb;
begin
  r := jsonb_build_object('today', v_today, 'generated_at', now());

  -- ── TUGAS DRIVER (per hari, bulan berjalan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'done', done, 'same', same) order by d), '[]'::jsonb) into x
    from (select tanggal d,
                 count(*) filter (where status <> 'CANCELLED') n,
                 count(*) filter (where status = 'DONE') done,
                 count(*) filter (where status = 'DONE' and (completed_at at time zone 'Asia/Jakarta')::date = tanggal) same
            from tasks where tanggal between v_m0 and v_today group by tanggal) s;
    r := r || jsonb_build_object('tasks_daily', x);
  exception when others then r := r || jsonb_build_object('tasks_daily', null);
  end;

  -- ── ARMADA (dokumen jatuh tempo + pemakaian bulan berjalan) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'nopol', v.nopol, 'jenis', v.jenis, 'plant', v.plant,
             'kir', v.kir_date, 'stnk', v.stnk_date, 'service', v.service_date,
             'days', (select count(distinct t.tanggal) from tasks t where t.vehicle_id = v.id and t.tanggal between v_m0 and v_today and t.status <> 'CANCELLED'),
             'trips', (select count(*) from tasks t where t.vehicle_id = v.id and t.tanggal between v_m0 and v_today and t.status <> 'CANCELLED')
           ) order by v.nopol), '[]'::jsonb) into x
      from vehicles v where v.aktif;
    r := r || jsonb_build_object('vehicles', x);
  exception when others then r := r || jsonb_build_object('vehicles', null);
  end;

  -- ── GATE (per hari bulan berjalan, per jam hari ini, yang masih terbuka) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'done', done, 'trip', trip) order by d), '[]'::jsonb) into x
    from (select (coalesce(time_out, time_in, created_at) at time zone 'Asia/Jakarta')::date d,
                 count(*) n, count(*) filter (where status = 'DONE') done,
                 round(avg(abs(extract(epoch from (time_in - time_out))) / 60) filter (where time_in is not null and time_out is not null)) trip
            from vehicle_gate_logs
           where coalesce(time_out, time_in, created_at) >= (v_m0::timestamp at time zone 'Asia/Jakarta')
           group by 1) s;
    select jsonb_build_object(
             'out', coalesce((select jsonb_agg(extract(hour from time_out at time zone 'Asia/Jakarta')::int) from vehicle_gate_logs where (time_out at time zone 'Asia/Jakarta')::date = v_today), '[]'::jsonb),
             'in',  coalesce((select jsonb_agg(extract(hour from time_in  at time zone 'Asia/Jakarta')::int) from vehicle_gate_logs where (time_in  at time zone 'Asia/Jakarta')::date = v_today), '[]'::jsonb)) into y;
    select coalesce(jsonb_agg(jsonb_build_object('plant', g.plant, 'nopol', ve.nopol,
             'since', coalesce(case when g.plant = 'CIK' then g.time_out else g.time_in end, g.created_at)) order by g.created_at), '[]'::jsonb) into z
      from vehicle_gate_logs g left join vehicles ve on ve.id = g.vehicle_id
     where g.status <> 'DONE';
    r := r || jsonb_build_object('gate_daily', x, 'gate_hours', y, 'gate_open', z);
  exception when others then r := r || jsonb_build_object('gate_daily', null, 'gate_hours', null, 'gate_open', null);
  end;

  -- ── KANTIN (per hari bulan berjalan: order & sisa per shift) ──
  --   so/sl = snack order/sisa, mo/ml = makan order/sisa — TERPISAH, tidak digabung.
  --   o/l (snack + makan) dipertahankan untuk kompatibilitas klien lama.
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', report_date,
             'so', jsonb_build_array(snack_order_1, snack_order_2, snack_order_3),
             'sl', jsonb_build_array(snack_leftover_1, snack_leftover_2, snack_leftover_3),
             'mo', jsonb_build_array(meal_order_1, meal_order_2, meal_order_3),
             'ml', jsonb_build_array(meal_leftover_1, meal_leftover_2, meal_leftover_3),
             'o', jsonb_build_array(snack_order_1 + meal_order_1, snack_order_2 + meal_order_2, snack_order_3 + meal_order_3),
             'l', jsonb_build_array(snack_leftover_1 + meal_leftover_1, snack_leftover_2 + meal_leftover_2, snack_leftover_3 + meal_leftover_3)
           ) order by report_date), '[]'::jsonb) into x
      from canteen_reports where report_date between v_m0 and v_today;
    r := r || jsonb_build_object('canteen_daily', x);
  exception when others then r := r || jsonb_build_object('canteen_daily', null);
  end;

  -- ── ATK (keluar per hari bulan berjalan, stok kritis, per departemen, item hari ini) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) into x
    from (select tanggal d, sum(jumlah) n from atk_requests where tanggal between v_m0 and v_today group by 1) s;
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into y
    from (select nama_barang nama, stok, coalesce(satuan, '') satuan, u30,
                 case when u30 > 0 then round(stok / (u30 / 30.0), 1) end cover
            from (select i.nama_barang, i.stok, i.satuan,
                         (select coalesce(sum(q.jumlah), 0) from atk_requests q where q.kode_barang = i.kode_barang and q.tanggal > v_today - 30) u30
                    from atk_items i) a
           where stok <= 0 or (u30 > 0 and stok / (u30 / 30.0) < 14)
           order by case when stok <= 0 then -1 else stok / nullif(u30 / 30.0, 0) end nulls last
           limit 8) s;
    select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) into z
    from (select coalesce(nullif(departemen, ''), 'Lainnya') k, sum(jumlah) n from atk_requests where tanggal between v_m0 and v_today group by 1 order by 2 desc limit 6) s;
    select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) into w
    from (select coalesce(i.nama_barang, q.kode_barang) k, sum(q.jumlah) n
            from atk_requests q left join atk_items i on i.kode_barang = q.kode_barang
           where q.tanggal = v_today group by 1 order by 2 desc limit 6) s;
    r := r || jsonb_build_object('atk_daily', x, 'atk_critical', y, 'atk_depts', z, 'atk_today', w);
  exception when others then r := r || jsonb_build_object('atk_daily', null, 'atk_critical', null, 'atk_depts', null, 'atk_today', null);
  end;

  return r;
end $$;

revoke all on function get_fm_snapshot() from public;
grant execute on function get_fm_snapshot() to anon, authenticated;
