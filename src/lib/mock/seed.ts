/* ════════════════════════════════════════════════════════════
   MOCK BACKEND — data awal demo.
   Port TypeScript dari supabase/05_data_demo.sql (perusahaan fiktif
   "PT Nusantara Prima Industri", plant CIK = Cikupa, PRB = Parung).
   Semua tanggal relatif terhadap HARI INI (WIB); random() diganti rng()
   berbiji supaya data konsisten antar-muat ulang.
════════════════════════════════════════════════════════════ */

import { addDays, isoDow, monthStart, rng, todayWib, uuid, wibIso, type MockDB, type Row } from "./core";

/* ── kosakata (sama persis dengan SQL) ── */
const DEPTS = ["Produksi", "Quality Assurance", "Engineering", "HR & GA", "Finance & Accounting", "Supply Chain", "Marketing", "IT", "HSE", "R&D", "Procurement", "Warehouse"];
const FIRST_NAMES = ["Andi", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hendra", "Indah", "Joko", "Kartika", "Lukman", "Maya", "Nanda", "Oki", "Putri",
  "Rizky", "Sari", "Taufik", "Umi", "Vina", "Wahyu", "Yogi", "Zahra", "Arif", "Bella", "Dimas", "Elsa", "Ferry", "Gilang", "Hana", "Irfan", "Jihan", "Kevin",
  "Laras", "Miko", "Nisa", "Prasetyo", "Ratna", "Sinta", "Teguh", "Wulan", "Yusuf", "Agnes", "Bayu", "Cahya", "Dian", "Erlangga", "Fitri", "Galih"];
const LAST_NAMES = ["Saputra", "Wijaya", "Lestari", "Pratama", "Santoso", "Hidayat", "Kusuma", "Nugroho", "Permata", "Setiawan", "Maharani", "Siregar",
  "Halim", "Putra", "Rahmawati", "Gunawan", "Wibowo", "Anggraini", "Firmansyah", "Utami"];
const JABATAN = ["Staff", "Staff", "Staff", "Senior Staff", "Supervisor", "Assistant Manager", "Manager"];
const TUJUAN = ["Kantor Pusat Sudirman", "Bandara Soekarno-Hatta", "Bank Mandiri KCP Cikupa", "Kantor Pajak Tangerang", "Pelabuhan Tanjung Priok",
  "Customer PT Sumber Rejeki", "Distributor Serpong", "Gudang Transit Balaraja", "Bengkel Resmi Toyota Cikupa", "Kantor Imigrasi Tangerang",
  "Hotel Santika BSD", "Customer PT Agro Lestari", "Laboratorium Sucofindo", "Kantor Notaris Karawaci", "Stasiun Tangerang", "Supplier PT Kemas Jaya"];
const PERIHAL = ["Antar dokumen tender", "Jemput tamu dari bandara", "Setor kas & ambil cek", "Lapor SPT masa", "Ambil dokumen impor",
  "Kirim sampel produk", "Meeting distributor", "Antar barang ke gudang transit", "Servis berkala kendaraan", "Urus KITAS tenaga ahli",
  "Antar peserta training", "Kunjungan customer", "Kirim sampel uji lab", "Legalisasi dokumen", "Jemput karyawan dinas", "Ambil kemasan sampel"];
const JENIS = ["Antar Dokumen", "Antar Jemput Tamu", "Keperluan Bank", "Antar Barang", "Kunjungan Customer", "Servis Kendaraan", "Antar Jemput Karyawan"];
const ATK_NAMES = ["Kertas HVS A4 70gr", "Kertas HVS F4 70gr", "Pulpen Hitam", "Pulpen Biru", "Pensil 2B", "Spidol Whiteboard Hitam", "Spidol Permanen",
  "Stabilo Kuning", "Tipe-X Kertas", "Map Plastik", "Ordner Besar", "Amplop Coklat A4", "Amplop Putih Kecil", "Staples No.10", "Isi Staples No.10",
  "Paper Clip", "Binder Clip 155", "Sticky Notes", "Lakban Bening", "Lakban Coklat", "Gunting Sedang", "Penggaris 30cm", "Buku Agenda", "Baterai AA", "Tinta Stempel"];
const ATK_UNIT = ["Rim", "Rim", "Pcs", "Pcs", "Pcs", "Pcs", "Pcs", "Pcs", "Pcs", "Pcs", "Pcs", "Pcs", "Pak", "Pcs", "Box", "Box", "Box", "Pak", "Roll", "Roll", "Pcs", "Pcs", "Pcs", "Pak", "Btl"];
const TGA_CAT = ["Listrik", "AC", "Plumbing", "Furniture", "Sipil", "Lainnya"];
const TGA_JOB = ["Ganti lampu TL ruang meeting", "AC tidak dingin di ruang HR", "Kran bocor toilet pria lt. 1", "Perbaiki kursi kerja staff finance",
  "Tambal dinding retak gudang", "Persiapan panggung townhall", "Perbaiki stop kontak pantry", "Cuci AC ruang server", "Saluran wastafel mampet",
  "Pasang rak arsip baru", "Cat ulang pintu lobby", "Angkat & pindah meja ke lt. 2", "Cek panel MCB area produksi", "Ganti remote AC ruang direksi",
  "Perbaiki engsel pintu toilet", "Pasang banner acara K3"];
const TGA_LOC = ["Gedung A lt. 1", "Gedung A lt. 2", "Gedung B", "Lobby", "Kantin", "Ruang Meeting Mawar", "Gudang Bahan Baku", "Pos Security", "Ruang Server", "Area Produksi"];
const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

const STAFF: { email: string; nama: string; role: string; plant: string | null }[] = [
  { email: "master@demo.cikops.id", nama: "Rina Kusuma (Master Admin)", role: "master", plant: null },
  { email: "ga.cik@demo.cikops.id", nama: "Dimas Pratama (Admin GA)", role: "admin_ga_cik", plant: "CIK" },
  { email: "ga.prb@demo.cikops.id", nama: "Wulan Sari (Admin GA Parung)", role: "admin_ga_prb", plant: "PRB" },
  { email: "iss@demo.cikops.id", nama: "Hendra Gunawan (SPV ISS)", role: "admin_iss", plant: null },
  { email: "security@demo.cikops.id", nama: "Bagus Wibowo (SPV Security)", role: "admin_security", plant: null },
  { email: "resepsionis@demo.cikops.id", nama: "Nadia Putri (Receptionist)", role: "receptionist", plant: null },
  { email: "manajemen@demo.cikops.id", nama: "Ir. Bambang Hartono (Plant Director)", role: "management", plant: null },
];

/* ── util ── */
const pad = (n: number, w: number) => String(n).padStart(w, "0");
/** menit sejak 00:00 → "HH:MM" */
const hm = (min: number) => `${pad(Math.floor(min / 60), 2)}:${pad(min % 60, 2)}`;
/** menit → "HH:MM:SS" (format kolom time Postgres) */
const hms = (min: number) => `${hm(min)}:00`;
/** tanggal WIB + menit sejak tengah malam → ISO (boleh lewat 24 jam) */
const tsAt = (d: string, min: number) => new Date(Date.parse(wibIso(d, "00:00")) + min * 60000).toISOString();
const ymd = (d: string) => d.replace(/-/g, "");
const yymm = (d: string) => d.slice(2, 4) + d.slice(5, 7);
/** geser bulan dari tanggal awal-bulan YYYY-MM-01 */
const addMonths = (m0: string, n: number) => {
  const y = Number(m0.slice(0, 4)), m = Number(m0.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${pad(mm + 1, 2)}-01`;
};
const sumExpr = (expr: string) => expr.split("+").reduce((s, p) => s + Number(p), 0);

export function buildSeed(): MockDB {
  const R = rng(42);
  /** (random() * k)::int — pembulatan seperti Postgres */
  const ri = (k: number) => Math.round(R() * k);

  const nowMs = Date.now();
  const NOW = new Date(nowMs).toISOString();
  const ago = (hours: number) => new Date(nowMs - hours * 3600000).toISOString();
  const today = todayWib();
  const nowMin = (() => { const w = new Date(nowMs + 7 * 3600000); return w.getUTCHours() * 60 + w.getUTCMinutes(); })();
  const m0 = monthStart(today);

  const db: MockDB = {};
  const T = (name: string) => (db[name] ??= []);
  const put = (name: string, row: Row) => { T(name).push(row); return row; };

  /* ════ Master: karyawan, jenis pekerjaan, tier ════ */
  const emp: Row[] = [];
  for (let i = 1; i <= 64; i++) {
    const nama = `${FIRST_NAMES[(i - 1) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
    emp.push(put("employees", {
      id: uuid(), nama, departement: DEPTS[(i - 1) % DEPTS.length], nik: `NPI-${10200 + i * 13}`,
      jabatan: JABATAN[(i * 3) % JABATAN.length], aktif: true,
      email: `${nama.replace(/ /g, ".").toLowerCase()}@nusantara-prima.demo`, no_hp: `0812${pad(3400000 + i * 7919, 8)}`,
      created_at: ago(24 * 90), updated_at: ago(24 * 90),
    }));
  }
  for (const label of [...JENIS, "Lainnya"]) put("job_types", { id: uuid(), label });
  const tierGold = uuid(), tierSilver = uuid(), tierBronze = uuid();
  put("driver_tiers", { id: tierGold, name: "Gold", color: "#d4a017", amount_per_month: 2500000, created_at: ago(24 * 90) });
  put("driver_tiers", { id: tierSilver, name: "Silver", color: "#94a3b8", amount_per_month: 1800000, created_at: ago(24 * 90) });
  put("driver_tiers", { id: tierBronze, name: "Bronze", color: "#b45309", amount_per_month: 1200000, created_at: ago(24 * 90) });

  /* ════ Akun login (auth_users) & profil staf ════ */
  const authUser = (email: string, full_name: string) =>
    put("auth_users", { id: uuid(), email, full_name, created_at: ago(24 * 60), user_metadata: {} }).id as string;
  for (const s of STAFF) {
    const id = authUser(s.email, s.nama);
    put("profiles", { id, full_name: s.nama, role: s.role, plant_scope: s.plant, is_master_admin: s.role === "master", allowed_tabs: null, created_at: ago(24 * 60) });
  }

  /* ════ Driver ════ */
  const DRIVER_NAMES = ["Andi Kurniawan", "Bambang Sutejo", "Cecep Hidayat", "Dodi Firmansyah", "Edi Prasetyo", "Feri Gunawan", "Gugun Saputra", "Hari Wibowo",
    "Iwan Setiadi", "Jajang Nurdin", "Komar Sulaeman", "Lutfi Hakim", "Mulyadi", "Nana Suryana", "Opik Taufik", "Pardi Santoso", "Rahmat Hidayat"];
  const drvInsert: Row[] = [];
  for (let i = 1; i <= 17; i++) {
    const dv: Row = {
      id: uuid(), nama: DRIVER_NAMES[i - 1], plant: i <= 12 ? "CIK" : "PRB",
      driver_type: [10, 11, 12].includes(i) ? "user" : i === 9 ? "support" : "operational",
      tier_id: i % 3 === 0 ? tierGold : i % 3 === 1 ? tierSilver : tierBronze,
      aktif: true, no_hp: `0813${pad(5500000 + i * 4211, 8)}`, avatar_emoji: null,
      email: i === 1 ? "driver.andi@demo.cikops.id" : `driver${i}@demo.cikops.id`,
      created_at: ago(24 * 60), updated_at: ago(24 * 60),
    };
    if (dv.driver_type === "user") {
      dv.assigned_user = ["Bpk. Hartono (Plant Director)", "Ibu Melati (HR Director)", "Bpk. Surya (Finance Director)"][i - 10];
      dv.assigned_user_title = ["Plant Director", "HR Director", "Finance Director"][i - 10];
    }
    put("drivers", dv);
    authUser(dv.email, dv.nama);
    drvInsert.push(dv);
  }
  // modul-modul berikutnya membaca driver "order by email" seperti SQL
  const drv = [...drvInsert].sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));

  put("app_settings", { key: "driver_user_ids", value: JSON.stringify(drvInsert.filter((x) => x.driver_type === "user").map((x) => ({ id: x.id, nama: x.nama, plant: x.plant }))), updated_at: NOW });
  put("app_settings", { key: "manager_email", value: "manager.ga@nusantara-prima.demo", updated_at: NOW });
  put("app_settings", { key: "manager_contacts", value: '[{"email":"manager.ga@nusantara-prima.demo","nama":"Rina Kusuma"}]', updated_at: NOW });

  /* ════ Armada ════ */
  const NOPOL = ["B 1203 NPI", "B 1457 NPI", "B 1688 NPI", "B 1724 NPI", "B 1901 NPI", "B 2045 NPI", "B 2178 NPI", "B 2233 NPI", "B 2390 NPI", "B 2412 NPI",
    "B 2561 NPI", "F 1102 NP", "F 1287 NP", "F 1350 NP", "F 1499 NP"];
  const VJENIS = ["Toyota Innova Zenix", "Toyota Avanza", "Daihatsu Gran Max Box", "Toyota Innova Reborn", "Mitsubishi Xpander", "Toyota Fortuner", "Suzuki APV",
    "Toyota Hiace", "Mitsubishi L300 Pick Up", "Honda HR-V", "Toyota Alphard", "Toyota Avanza", "Daihatsu Gran Max Box", "Toyota Innova Reborn", "Isuzu Elf"];
  const VDEPT = ["GA", "GA", "Supply Chain", "Direksi", "Marketing", "Direksi", "GA", "HR & GA", "Warehouse", "Marketing", "Direksi", "GA", "Supply Chain", "GA", "Warehouse"];
  const veh: Row[] = [];
  for (let i = 1; i <= 15; i++) {
    const vh: Row = {
      id: uuid(), nopol: NOPOL[i - 1], jenis: VJENIS[i - 1], plant: i <= 11 ? "CIK" : "PRB", aktif: true, year: 2018 + (i % 7),
      color: ["Putih", "Hitam", "Silver", "Abu-abu"][i % 4], fuel: [3, 6, 9, 13, 15].includes(i) ? "Solar" : "Bensin",
      odometer: 18000 + i * 7350, dept: VDEPT[i - 1],
      stnk_date: addDays(today, i === 2 ? 6 : i === 7 ? 20 : i === 12 ? -3 : 60 + i * 23),
      kir_date: addDays(today, i === 3 ? 12 : i === 9 ? 4 : 90 + i * 17),
      service_date: addDays(today, i === 5 ? 2 : i === 14 ? 9 : 25 + i * 11),
      created_at: ago(24 * 90), updated_at: ago(24 * 30),
    };
    if (i <= 9) vh.default_driver_id = drv[i - 1].id;
    veh.push(put("vehicles", vh));
  }

  /* ════ Tugas driver 45 hari terakhir + hari ini + 5 hari ke depan (+ log gate) ════ */
  for (let off = -45; off <= 5; off++) {
    const d = addDays(today, off);
    const weekend = isoDow(d) >= 6;
    for (const dv of drv.filter((x) => x.driver_type !== "user")) {
      let n = weekend ? (R() < 0.25 ? 1 : 0) : 1 + ri(2.2);
      if (d > today) n = R() < 0.3 ? 1 : 0;
      const pool = veh.filter((x) => x.plant === dv.plant);
      for (let k = 1; k <= n; k++) {
        const vh = pool[Math.floor(R() * pool.length)];
        const t = 450 + (k - 1) * 180 + ri(50);
        const j = 1 + ri(TUJUAN.length - 1);
        const e = emp[ri(63)];
        let status: string;
        if (d < today || (d === today && t + 180 < nowMin)) status = R() < 0.04 ? "CANCELLED" : "DONE";
        else if (d === today && t < nowMin) status = "ON GOING";
        else status = "ASSIGNED";
        const row: Row = {
          id: uuid(), tanggal: d, driver_id: dv.id, vehicle_id: vh.id, plant: dv.plant,
          jenis_pekerjaan: JENIS[(j - 1) % JENIS.length], tujuan: TUJUAN[j - 1], perihal: PERIHAL[j - 1],
          requestor: e.nama, departement: e.departement, status,
          lokasi_asal: dv.plant === "PRB" ? "Plant Parung" : "Plant Cikupa", auto_completed: false,
          created_at: tsAt(d, t - 50),
        };
        if (status === "ON GOING" || status === "DONE") row.accepted_at = tsAt(d, t);
        if (status === "DONE") row.completed_at = tsAt(d, t + 90 + ri(120));
        if (status === "CANCELLED") {
          row.cancelled_at = tsAt(d, t - 20); row.cancelled_by = "admin"; row.cancel_reason = "Jadwal requestor berubah";
        }
        put("tasks", row);
        /* log gate: kendaraan CIK keluar–kembali, kendaraan PRB masuk–keluar CIK */
        if ((status === "ON GOING" || status === "DONE") && R() < 0.8) {
          const end = t + 100 + ri(110);
          const g: Row = {
            id: uuid(), vehicle_id: vh.id, driver_id: dv.id, plant: dv.plant, tujuan: TUJUAN[j - 1], keterangan: PERIHAL[j - 1],
            status: status === "DONE" ? "DONE" : dv.plant === "CIK" ? "OUT" : "IN", created_at: tsAt(d, t),
          };
          const tOut = dv.plant === "CIK" ? tsAt(d, t + 8) : status === "DONE" ? tsAt(d, end) : null;
          const tIn = dv.plant === "PRB" ? tsAt(d, t + 45) : status === "DONE" ? tsAt(d, end) : null;
          g.time_out = tOut; g.time_in = tIn;
          put("vehicle_gate_logs", g);
        }
      }
    }
  }

  /* ════ Klaim driver mingguan (10 minggu) + Self-Claim ════ */
  for (const dv of drv.filter((x) => x.driver_type !== "support")) {
    for (let k = 0; k <= 9; k++) {
      const d = addDays(today, -(k * 7 + 3));
      const exprs = [
        { type: "Gasoline", expr: String(200000 + ri(6) * 50000) },
        { type: "Toll", expr: ["15500+15500", "22000+22000", "9500+9500+12000", "31000+31000"][ri(3)] },
        { type: "Parking", expr: ["5000+5000", "10000", "6000+4000+5000"][ri(2)] },
      ];
      const items = exprs.map((x) => ({ ...x, total: sumExpr(x.expr) }));
      put("claims", {
        id: uuid(), driver_id: dv.id, plant: dv.plant, submission_date: addDays(d, 1), period_date: d, items,
        total: items.reduce((s, x) => s + x.total, 0), status: "submitted", note: "", submitted_at: wibIso(addDays(d, 1), "09:15"),
      });
    }
  }
  drv.filter((x) => x.driver_type === "operational").slice(0, 5).forEach((dv, idx) => {
    const i = idx + 1;
    const row: Row = {
      id: uuid(), driver_id: dv.id, period_date: addDays(today, -i),
      items: [{ type: "Gasoline", expr: "250000", total: 250000 }, { type: "Toll", expr: "19500+19500", total: 39000 }], total: 289000,
      note: `Perjalanan ke ${TUJUAN[i - 1]}`, nota: i % 2 === 0 ? "menyusul" : "ada",
      status: ["menunggu", "menunggu", "menunggu", "disetujui", "ditolak"][i - 1],
      admin_note: i === 5 ? "Nota tol tidak terbaca, mohon upload ulang" : "",
      created_at: ago(i * 7), updated_at: ago(i * 7),
    };
    if (i >= 4) { row.reviewed_by = "Rina Kusuma"; row.reviewed_at = ago(24); row.updated_at = ago(24); }
    put("driver_claim_requests", row);
  });

  /* ════ Dana operasional (4 periode per plant), lembur, karangan bunga ════ */
  for (let k = 0; k <= 3; k++) {
    for (const p of ["CIK", "PRB"]) {
      const cik = p === "CIK", ms = addMonths(m0, -k);
      put("kantong", {
        id: uuid(), plant: p, period: ms.slice(0, 7),
        total_budget: cik ? 45000000 : 20000000, alloc_op_driver: cik ? 30000000 : 13000000, alloc_emergency: cik ? 5000000 : 2500000,
        cash_available: cik ? 12500000 - k * 900000 : 6400000 - k * 400000,
        claim_submitted: cik ? 18400000 + k * 650000 : 7300000 + k * 300000,
        claim_paid: cik ? 14200000 + k * 500000 : 5600000 + k * 250000,
        unsubmitted_claim: k === 0 ? (cik ? 1850000 : 640000) : 0, last_reset: ms,
      });
    }
  }
  for (const dv of drv) {
    for (let k = 0; k <= 2; k++) {
      const h = 6 + ri(22);
      put("overtime", {
        id: uuid(), driver_id: dv.id, plant: dv.plant, period: addMonths(m0, -k).slice(0, 7), hours: h, amount: h * 28500,
        reason: ["Antar jemput direksi", "Tamu luar kota", "Lembur akhir bulan", "Event perusahaan"][ri(3)], created_at: NOW,
      });
    }
  }
  put("condolence_wreaths", { id: uuid(), plant: "CIK", tanggal: addDays(today, -9), atas_nama: "Keluarga Bpk. Suryanto (Produksi)", keterangan: "Karangan bunga duka cita", claimed: true, created_at: tsAt(addDays(today, -9), 600) });
  put("condolence_wreaths", { id: uuid(), plant: "CIK", tanggal: addDays(today, -2), atas_nama: "Keluarga Ibu Ratna (Finance)", keterangan: "Karangan bunga duka cita", claimed: false, created_at: tsAt(addDays(today, -2), 600) });

  /* ════ Pom bensin ════ */
  const gas = (name: string, address: string, lat: number, lng: number, fuels: [string, boolean][], notes: string) =>
    put("gas_stations", { id: uuid(), name, address, lat, lng, fuels: fuels.map(([type, available]) => ({ type, available })), notes, created_at: ago(24 * 90), updated_at: ago(24 * 90) });
  gas("SPBU 34.157.01 Cikupa", "Jl. Raya Serang KM 18, Cikupa", -6.2295, 106.5102, [["Pertalite", true], ["Pertamax", true], ["Dexlite", true]], "Buka 24 jam, bisa kartu fleet");
  gas("SPBU 34.157.08 Bitung", "Jl. Raya Serang, Bitung Jaya", -6.2181, 106.553, [["Pertalite", true], ["Pertamax", true], ["Solar", true]], "");
  gas("Shell Citra Raya", "Boulevard Citra Raya, Cikupa", -6.2512, 106.5243, [["Super", true], ["V-Power", true], ["V-Power Diesel", false]], "Toilet bersih, ada minimarket");
  gas("SPBU 34.163.02 Balaraja", "Jl. Raya Serang KM 24, Balaraja", -6.2013, 106.4597, [["Pertalite", true], ["Solar", true]], "Antrean solar panjang pagi hari");
  gas("SPBU 34.163.11 Parung", "Jl. Raya Parung, Bogor", -6.4221, 106.7339, [["Pertalite", true], ["Pertamax", true], ["Dexlite", true]], "Terdekat dari Plant Parung");
  gas("BP Karawaci", "Jl. Imam Bonjol, Karawaci", -6.2167, 106.6017, [["BP 92", true], ["BP Ultimate", true], ["BP Diesel", true]], "");

  /* ════ Kantin: 60 hari terakhir ════ */
  for (let off = -60; off <= -1; off++) {
    const d = addDays(today, off);
    const r = isoDow(d) >= 6 ? 0.45 : 1;
    const rd = (x: number) => Math.round(x * r);
    put("canteen_reports", {
      id: uuid(), report_date: d, submitted_by: "Petugas Kantin",
      snack_order_1: rd(320), snack_order_2: rd(260), snack_order_3: rd(140),
      snack_leftover_1: rd(6 + R() * 22), snack_leftover_2: rd(5 + R() * 20), snack_leftover_3: rd(2 + R() * 14),
      meal_order_1: rd(410), meal_order_2: rd(330), meal_order_3: rd(180),
      meal_leftover_1: rd(8 + R() * 30), meal_leftover_2: rd(6 + R() * 26), meal_leftover_3: rd(3 + R() * 18),
      created_at: tsAt(d, 15 * 60),
    });
  }

  /* ════ ATK ════ */
  const atkCode = (idx0: number) => `ATK${pad(idx0 + 1, 3)}`;
  for (let i = 1; i <= ATK_NAMES.length; i++) {
    put("atk_items", {
      id: uuid(), kode_barang: atkCode(i - 1), nama_barang: ATK_NAMES[i - 1], satuan: ATK_UNIT[i - 1],
      stok: [3, 12, 19].includes(i) ? 2 : [7, 15].includes(i) ? 0 : 25 + ((i * 17) % 140), min_stok: i <= 2 ? 20 : 10,
      source: "web", excel_pulled_at: NOW, created_by: "Admin GA", created_at: ago(24 * 90), updated_at: NOW,
    });
  }
  let nReq = 0;
  for (let off = -60; off <= 0; off++) {
    const d = addDays(today, off);
    if (isoDow(d) >= 6) continue;
    const kMax = 1 + ri(4);
    for (let k = 1; k <= kMax; k++) {
      nReq++;
      const e = emp[ri(63)];
      const i = 1 + ri(ATK_NAMES.length - 1);
      const jMax = ri(2);
      for (let j = 0; j <= jMax; j++) {
        const x = (i + j * 5 - 1) % ATK_NAMES.length;
        put("atk_requests", {
          id: uuid(), request_id: `REQ-${ymd(d)}${pad(nReq, 4)}`, tanggal: d, nama: e.nama, nik: e.nik, departemen: e.departement,
          kode_barang: atkCode(x), nama_barang: ATK_NAMES[x], jumlah: 1 + ri(4), satuan: ATK_UNIT[x],
          helper: "Staff GA", source: "web", excel_pulled_at: NOW, created_by: "Admin GA", created_at: tsAt(d, 600 + k * 47),
        });
      }
    }
  }
  for (let k = 0; k <= 3; k++) {
    const d = addDays(today, -k * 14);
    for (let i = 1; i <= 8; i++) {
      const j = 1 + ((i * 3 + k) % ATK_NAMES.length);
      put("atk_restocks", {
        id: uuid(), update_id: `UPD-${ymd(d)}${pad(i, 4)}`, tanggal: d, nama: "Admin GA", nik: "", departemen: "Pembelian rutin",
        kode_barang: atkCode(j - 1), nama_barang: ATK_NAMES[j - 1], jumlah: 20 + ((i * 7) % 40), satuan: ATK_UNIT[j - 1],
        source: "web", excel_pulled_at: NOW, created_by: "Admin GA", created_at: tsAt(d, 9 * 60),
      });
    }
  }

  /* ════ Locker (72 unit) ════ */
  for (let i = 1; i <= 72; i++) {
    const e = emp[(i * 5) % 64];
    const pin = pad(((i * 7919) % 9000) + 1000, 4);
    if ([0, 3, 7].includes(i % 10)) {
      put("lockers", { id: uuid(), row_no: i, number: String(i), pin, status: "Available" });
    } else {
      const intern = i % 9 === 4;
      const row: Row = {
        id: uuid(), row_no: i, number: String(i), pin, status: "Terisi",
        nama: intern ? `Intern ${FIRST_NAMES[i % 40]}` : e.nama, no_hp: e.no_hp, email: e.email,
        periode: intern ? `Jul-Des ${today.slice(0, 4)}` : "Employee",
        extra: intern ? "Universitas Pelita Nusa" : e.departement,
        last_confirmed: addDays(today, -(i % 40)),
      };
      if (intern) row.end_date = addDays(today, 45);
      put("lockers", row);
    }
  }

  /* ════ Printer & permintaan printer ════ */
  const PRN_LOC = ["Lobby - Resepsionis", "Lantai 2 - Finance", "Lantai 2 - HR & GA", "Lantai 3 - Marketing", "Produksi - Office", "QA Laboratorium", "Gudang - Admin", "Ruang Direksi"];
  for (let i = 1; i <= 8; i++) {
    const pid = uuid();
    put("printers", {
      id: pid, no_eq: `PRN-${pad(i, 3)}`, location: PRN_LOC[i - 1], type: [2, 4, 8].includes(i) ? "COLOR" : "BW",
      brand: ["Canon", "Ricoh", "Fuji Xerox", "Epson"][i % 4], control_panel_url: `http://10.10.20.${40 + i}`, aktif: true, created_at: ago(24 * 120),
    });
    for (let k = 1; k <= 4; k++) {
      const e = emp[(i * 11 + k * 3) % 64];
      const row: Row = {
        id: uuid(), printer_id: pid, source: k % 2 === 0 ? "EMPLOYEE" : "ADMIN",
        request_type: ["RESET_KUOTA", "TAMBAH_KUOTA", "AMBIL_TONER", "TAMBAH_KUOTA"][k - 1], employee_name: e.nama, department: e.departement,
        print_user_id: `U${pad((i * 31 + k) % 900, 4)}`, notes: k === 3 ? "Toner hitam habis" : "", created_at: ago((i * 4 + k) * 19),
      };
      if (k === 2 || k === 4) row.quota_amount = 200 + k * 50;
      put("printer_requests", row);
    }
  }

  /* ════ Permintaan karyawan (/request) ════ */
  for (let i = 1; i <= 24; i++) {
    const e = emp[(i * 13) % 64];
    const status = ["PENDING", "PENDING", "IN_PROGRESS", "DONE", "DONE", "DONE", "REJECTED"][i % 7];
    const row: Row = {
      id: uuid(), request_type: ["DRIVER", "DRIVER", "TONER", "OTHER"][i % 4], employee_name: e.nama, department: e.departement, phone: e.no_hp,
      description: ["Butuh mobil + driver ke kantor pusat", "Jemput tamu di bandara", "Toner printer lantai 2 habis", "Minta kursi kerja pengganti"][i % 4],
      details: i % 4 === 0 || i % 4 === 1
        ? { eventDate: addDays(today, i % 6), destination: TUJUAN[i % 16], departureTime: "09:00", purpose: PERIHAL[i % 16], additionalNotes: "" }
        : {},
      status, created_at: ago(i * 9),
    };
    if (status === "REJECTED") row.admin_notes = "Tidak ada armada tersedia di jam tsb, mohon ajukan ulang";
    else if (status === "DONE") row.admin_notes = "Sudah ditangani";
    if (status === "DONE" || status === "REJECTED") row.processed_at = ago(i * 9 - 4);
    put("employee_requests", row);
  }

  /* ════ Pembagian (gift) ════ */
  const giftId = uuid();
  put("gift_events", {
    id: giftId, name: "Bingkisan HUT Perusahaan ke-25", description: "Kaos + tumbler untuk seluruh karyawan",
    items: [{ name: "Kaos HUT", variants: ["S", "M", "L", "XL", "XXL"] }, { name: "Tumbler", variants: [] }],
    status: "open", plant: "CIK", created_at: ago(24 * 10), updated_at: ago(24 * 10),
  });
  for (let i = 1; i <= 40; i++) {
    const e = emp[i - 1];
    const claimed = i % 3 !== 0;
    const row: Row = {
      id: uuid(), event_id: giftId, nik: e.nik, nama: e.nama, departemen: e.departement, email: e.email,
      selections: [{ item: "Kaos HUT", variant: ["S", "M", "L", "XL", "XXL"][i % 5] }, { item: "Tumbler", variant: "" }],
      // mock: passcode disimpan polos (SQL: bcrypt)
      passcode_hash: pad(i * 37, 6), claimed, registered_at: ago(24 * (3 + (i % 5))),
    };
    if (claimed) { row.claimed_at = ago(i * 2); row.claimed_by = "Petugas GA"; }
    put("gift_registrations", row);
  }

  /* ════ Pengumuman & kalender ════ */
  put("announcements", { id: uuid(), title: "Selamat datang di CIKOPS Demo", body: "Semua data di sini fiktif. Silakan jelajahi setiap modul — tidak ada yang tersimpan ke sistem asli.", is_active: true, created_by: "Admin GA", created_at: ago(1) });
  put("announcements", { id: uuid(), title: "Servis berkala armada minggu ini", body: "Kendaraan B 1901 NPI & F 1350 NP masuk bengkel Rabu–Kamis. Jadwalkan tugas dengan armada lain.", is_active: true, created_by: "Admin GA", created_at: ago(2) });
  put("announcements", { id: uuid(), title: "Audit K3 tahunan", body: "Audit K3 eksternal dijadwalkan pekan depan. Mohon area kerja dirapikan.", is_active: true, created_by: "HSE", created_at: ago(3) });
  const AG_TITLE = ["Kunjungan customer PT Sumber Rejeki", "Audit internal ISO 9001", "Townhall bulanan", "Training K3 karyawan baru", "Kunjungan supplier kemasan",
    "Rapat koordinasi GA", "Medical check-up karyawan", "Kunjungan direksi kantor pusat", "Donor darah", "Family gathering - persiapan", "Rapat budget Q4"];
  for (let i = -10; i <= 20; i++) {
    if (i % 3 !== 0) continue;
    const a = Math.abs(i);
    put("agenda_events", {
      id: uuid(), title: AG_TITLE[a % 11], location: ["Ruang Meeting Mawar", "Aula", "Area Produksi", "Lobby", "Ruang Direksi"][a % 5],
      event_date: addDays(today, i), event_time: ["09:00", "10:00", "13:00", "14:30"][a % 4], end_time: ["11:00", "12:00", "15:00", "16:00"][a % 4],
      kategori: ["kunjungan", "event", "meeting", "pelatihan"][a % 4], color: ["#2f6bff", "#16a34a", "#f59e0b", "#a855f7"][a % 4],
      pic: emp[a * 3].nama, notes: "", created_by: "Admin GA", created_at: ago(24 * 14), updated_at: ago(24 * 14),
    });
  }

  /* ════ Resepsionis ════ */
  put("rcp_settings", {
    id: 1, open_time: "07:30", close_time: "17:00", slot_minutes: 30, room_name: "Induction Room", wifi_ssid: "NPI-Guest",
    wifi_terms: "Akun wifi hanya untuk tamu terdaftar. Dilarang dibagikan.", updated_at: NOW,
  });
  const ym = yymm(today);
  for (let i = 1; i <= 10; i++) {
    const accId = uuid();
    put("rcp_wifi_accounts", {
      id: accId, username: `guest${pad(i, 2)}`, password: `Npi${4000 + i * 37}`, valid_from: m0, valid_until: addDays(today, i <= 2 ? 5 : 60),
      slots: 3, batch: m0.slice(0, 7), active: true, created_by: "Receptionist", created_at: tsAt(m0, 8 * 60),
    });
    for (let k = 1; k <= (i <= 6 ? 2 : 1); k++) {
      const e = emp[(i * 7 + k) % 64];
      const row: Row = {
        id: uuid(), receipt_no: `WF-${ym}-${pad(i * 2 + k, 3)}`, account_id: accId, slots: 1,
        guest_name: ["Mr. Tanaka", "Ms. Lee", "Bpk. Rudi (Auditor)", "Ibu Sarah (Konsultan)", "Tim Vendor IT"][(i + k) % 5],
        guest_company: ["Tokyo Pack Co.", "Seoul Machinery", "KAP Mitra Audit", "PT Konsultan Prima", "PT Solusi Data"][(i + k) % 5],
        requestor_name: e.nama, requestor_email: e.email, department: e.departement, purpose: "Kunjungan kerja",
        start_date: addDays(today, -(i % 3)), end_date: addDays(today, i % 4), created_by: "Receptionist", created_at: ago(i * 5), share_token: uuid(),
      };
      if (i > 8) row.returned_at = ago(2);
      put("rcp_wifi_grants", row);
    }
  }
  for (let i = 1; i <= 36; i++) {
    const e = emp[(i * 9) % 64];
    const status = i % 4 === 0 || i > 30 ? "waiting" : "handed";
    const out = i % 5 === 0;
    const row: Row = {
      id: uuid(), receipt_no: `${out ? "OUT" : "IN"}-${ym}-${pad(i, 3)}`, direction: out ? "out" : "in",
      item_type: ["Paket", "Dokumen", "Surat"][i % 3], description: ["Paket sparepart", "Dokumen kontrak", "Surat undangan", "Sampel produk", "Paket ATK"][i % 5],
      sender: ["JNE", "TIKI", "Kantor Pusat", "PT Kemas Jaya", "Bank Mandiri"][i % 5], recipient: e.nama, department: e.departement, email: e.email,
      courier: ["JNE", "J&T", "SiCepat", "Kurir internal"][i % 4], status, created_by: "Receptionist",
      created_at: ago(status === "waiting" ? (i === 4 || i === 8 ? 60 : 1 + (i % 9)) : i * 4), share_token: uuid(),
    };
    if (status === "handed") { row.handed_to = e.nama; row.handed_at = ago(i * 3); row.handed_by = "Receptionist"; }
    put("rcp_parcels", row);
  }
  const BK_TITLE = ["Induksi karyawan baru", "Training 5S", "Briefing kontraktor", "Safety induction tamu", "Interview kandidat"];
  for (let i = -5; i <= 10; i++) {
    const d = addDays(today, i);
    if (isoDow(d) >= 6) continue;
    const a = Math.abs(i);
    for (let k = 0; k <= 1 + (a % 2); k++) {
      const e = emp[(a * 5 + k) % 64];
      put("rcp_room_bookings", {
        id: uuid(), room: "Induction Room", booking_date: d, start_time: hms(510 + k * 180), end_time: hms(600 + k * 180),
        title: BK_TITLE[(a + k) % 5], pic_name: e.nama, pic_email: e.email, department: e.departement, attendees: 6 + ((a * 3 + k) % 14),
        notes: "", created_by: "Receptionist", created_at: ago(24 * 7), receipt_no: `BK-${ym}-${pad((i + 6) * 3 + k, 3)}`, share_token: uuid(),
      });
    }
  }
  for (const [prefix, last] of [["WF", 40], ["IN", 40], ["OUT", 40], ["BK", 60]] as const) put("rcp_counters", { prefix, period: ym, last });

  /* ════ Cleaning & Gardening ════ */
  put("ga_sync_config", {
    id: 1, sync_key: "demo-ga-key", master: "cikops", master_since: ago(24 * 30), last_sync_at: null,
    last_pull_at: ago(24), last_pull_computer: "PC-SPV-ISS",
  });
  const AREA_TUGAS = ["Gedung A", "Gedung B", "Produksi", "Kantin", "Lobby", "Toilet", "Gudang", "Area Luar"];
  for (let i = 1; i <= 12; i++) {
    put("ga_manpower", {
      id: `${i <= 8 ? "CS" : "GD"}${pad(i, 2)}`, nama: `${FIRST_NAMES[9 + i]} ${LAST_NAMES[i % 20]}`,
      tim: i <= 8 ? "Cleaning Service" : "Gardener", jabatan: i === 1 || i === 9 ? "Leader" : "Crew", area_tugas: AREA_TUGAS[i % 8],
      status: "Aktif", no_hp: `0857${pad(1200000 + i * 911, 8)}`, updated_at: NOW,
    });
  }
  const GJ_LOK = ["Gedung A", "Gedung A", "Gedung B", "Lobby", "Kantin", "Toilet Lt.1", "Toilet Lt.2", "Ruang Meeting", "Mushola", "Produksi", "Gudang", "Pos Security", "Parkir", "Ruang Direksi",
    "Taman Depan", "Taman Belakang", "Area Parkir", "Pagar Keliling", "Pot Lobby", "Kolam"];
  const GJ_TIPE = ["Sapu & pel lantai", "Lap kaca jendela", "Sapu & pel lantai", "Lap meja & sofa", "Bersihkan meja makan", "Bersihkan toilet", "Bersihkan toilet", "Rapikan ruang", "Bersihkan karpet",
    "Buang sampah", "Sapu area", "Lap meja", "Sapu parkir", "Lap & vacuum", "Siram tanaman", "Potong rumput", "Sapu daun", "Pangkas pagar", "Siram & pupuk", "Kuras kolam"];
  const jobs: Row[] = [];
  for (let i = 1; i <= 20; i++) {
    const weekly = [2, 9, 16, 18, 20].includes(i);
    jobs.push(put("ga_jobs", {
      id: `${i <= 14 ? "CS-" : "GD-"}${pad(i, 3)}`, tim: i <= 14 ? "Cleaning Service" : "Gardener", lokasi: GJ_LOK[i - 1], tipe: GJ_TIPE[i - 1],
      area: `Area ${1 + (i % 4)}`, frek: weekly ? "Mingguan" : "Harian",
      hari: weekly ? ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"][i % 5] : "Senin,Selasa,Rabu,Kamis,Jumat",
      petugas: `${FIRST_NAMES[10 + (i % 12)]} ${LAST_NAMES[(1 + (i % 12)) % 20]}`, aktif: true, catatan: "",
      created_at: ago(24 * 90), updated_at: ago(24 * 30), updated_by: "SPV ISS",
    }));
  }
  const jobDays = new Map(jobs.map((j) => [j.id as string, new Set(String(j.hari).split(",").map((h) => DAY_NAMES.indexOf(h.trim()) + 1))]));
  const planStart = addMonths(m0, -1), planEnd = addDays(addMonths(m0, 1), -1);
  for (let d = planStart; d <= planEnd; d = addDays(d, 1)) {
    const dow = isoDow(d);
    const firstDow = isoDow(monthStart(d));
    const week = Math.floor((Number(d.slice(8, 10)) + firstDow - 2) / 7) + 1;
    for (const job of jobs) {
      if (!job.aktif || !jobDays.get(job.id)!.has(dow)) continue;
      const r = R();
      const past = d < today;
      const row: Row = {
        key: `${job.id}|${ymd(d)}`, periode: Number(ymd(d).slice(0, 6)), tanggal: d, hari: DAY_NAMES[dow - 1], minggu_ke: week,
        job_id: job.id, tim: job.tim, lokasi: job.lokasi, tipe: job.tipe, area: job.area, frek: job.frek, petugas: job.petugas,
        plan: 1, actual: past ? (r < 0.93 ? 1 : 0) : null, spv: past ? "SPV ISS" : "", waktu_input: past ? wibIso(d, "16:30") : null,
        sync_id: "cikops", synced_at: past ? wibIso(d, "16:35") : NOW,
      };
      put("ga_plan", row);
    }
  }
  const GE_NAMA = ["Persiapan townhall", "Kerja bakti 5R", "Dekorasi HUT RI", "Support audit ISO", "Family day", "Fogging area plant", "Penanaman pohon", "Bersih-bersih pasca banjir"];
  const GI_DESK = ["Ganti keset lobby", "Tambah tempat sampah terpilah", "Perbaiki saluran air taman", "Tambah dispenser sabun toilet", "Ganti selang taman", "Pasang rambu lantai basah", "Tanam ulang rumput area parkir", "Rapikan gudang alat"];
  const GI_AREA = ["Lobby", "Produksi", "Taman", "Toilet", "Taman", "Gedung A", "Parkir", "Gudang"];
  for (let i = 1; i <= 8; i++) {
    put("ga_events", {
      id: i, baris: i, tanggal: addDays(today, -i * 6), nama: GE_NAMA[i - 1], deskripsi: "Support tim Cleaning & Gardening",
      waktu: ["Pagi", "Siang", "Full day"][i % 3], support: "4 crew cleaning, 2 gardener", dokumentasi: "", updated_by: "SPV ISS", updated_at: NOW,
    });
    put("ga_improvements", {
      id: i, baris: i, tanggal: addDays(today, -i * 5), kategori: ["Kebersihan", "Taman", "Keamanan"][i % 3], jenis: ["Perbaikan", "Penambahan", "Penggantian"][i % 3],
      deskripsi: GI_DESK[i - 1], area: GI_AREA[i - 1], petugas: "Crew ISS", pengawas: "SPV ISS", dokumentasi: "", updated_by: "SPV ISS", updated_at: NOW,
    });
  }
  const INV_NAMA = ["Mesin poles lantai", "Vacuum cleaner", "Mop set", "Tangga lipat", "Mesin potong rumput", "Gunting pangkas", "Selang 30m", "Troli sampah", "Wet floor sign", "Sprayer", "Blower daun", "Ember peras", "Sapu ijuk", "Pengki"];
  for (let i = 1; i <= 14; i++) {
    put("ga_inventory", {
      id: i, baris: i, kode: `INV-${pad(i, 3)}`, nama: INV_NAMA[i - 1], jenis: [5, 6, 7, 10, 11].includes(i) ? "Taman" : "Kebersihan",
      area: ["Gudang ISS", "Gedung A", "Gedung B"][i % 3], status: i === 2 || i === 11 ? "Perlu servis" : i === 5 ? "Rusak" : "Baik",
      jumlah: 1 + ((i * 3) % 9), tgl_update: addDays(today, -i), foto: "", updated_by: "SPV ISS", updated_at: NOW,
    });
  }

  /* ════ TGA ════ */
  const tga: Row[] = [];
  ["Supriyadi", "Agus Salim", "Dedi Kurnia", "Rohmat"].forEach((nama, idx) => {
    const i = idx + 1;
    tga.push(put("tga_users", {
      id: uuid(), nama, no_hp: `0819${pad(2200000 + i * 733, 8)}`, pin: "1234", pin_hash: "", aktif: true, failed_count: 0,
      last_login_at: ago(i * 3), created_at: ago(24 * 90),
    }));
  });
  let nTga = 0;
  for (let off = -45; off <= 0; off++) {
    const d = addDays(today, off);
    if (isoDow(d) === 7) continue;
    const kMax = 2 + ri(3);
    for (let k = 1; k <= kMax; k++) {
      nTga++;
      const e = emp[ri(63)], dv = tga[ri(3)], j = 1 + ri(15);
      const t = 480 + (k - 1) * 95;
      const status = d < today || t + 120 < nowMin ? "selesai" : "proses";
      if (d === today && t > nowMin) continue;
      const row: Row = {
        id: uuid(), ref_no: `TGA-${yymm(d)}-${pad(nTga, 3)}`, user_id: dv.id, nama_tga: dv.nama, tanggal: d, jam_mulai: hms(t),
        kategori: TGA_CAT[(j - 1) % 6], lokasi: TGA_LOC[j % 10], activity: TGA_JOB[j - 1], request_by: e.nama, requestor_id: e.id, departemen: e.departement,
        status, prioritas: R() < 0.12 ? "urgent" : "normal", catatan: "",
        sumber: ["mandiri", "tugas", "permintaan"][nTga % 3], assigned_by: nTga % 3 === 1 ? "Rina Kusuma" : nTga % 3 === 2 ? "Permintaan karyawan" : "",
        assigned_at: tsAt(d, t - 20), accepted_at: tsAt(d, t), created_at: tsAt(d, t - 20), updated_at: tsAt(d, t + 70),
      };
      if (status === "selesai") { row.jam_selesai = hms(t + 70); row.selesai_at = tsAt(d, t + 70); }
      put("tga_activities", row);
    }
  }
  // tugas terbuka: belum diambil (urgent), menunggu diterima, butuh part
  const tm = yymm(today);
  put("tga_activities", {
    id: uuid(), ref_no: `TGA-${tm}-${pad(nTga + 1, 3)}`, user_id: null, nama_tga: "", tanggal: today, kategori: "Plumbing", lokasi: "Toilet Gedung B",
    activity: "Toilet wanita mampet, air meluap", request_by: emp[4].nama, departemen: emp[4].departement, status: "baru", prioritas: "urgent",
    sumber: "permintaan", assigned_by: "Permintaan karyawan", assigned_at: ago(0.2), created_at: ago(0.2), updated_at: ago(0.2),
  });
  put("tga_activities", {
    id: uuid(), ref_no: `TGA-${tm}-${pad(nTga + 2, 3)}`, user_id: tga[2].id, nama_tga: tga[2].nama, tanggal: today, kategori: "AC", lokasi: "Ruang Meeting Mawar",
    activity: "AC ruang meeting tidak dingin", request_by: emp[9].nama, departemen: emp[9].departement, status: "baru", prioritas: "normal",
    sumber: "tugas", assigned_by: "Rina Kusuma · form", assigned_at: ago(25 / 60), created_at: ago(25 / 60), updated_at: ago(25 / 60),
  });
  put("tga_activities", {
    id: uuid(), ref_no: `TGA-${tm}-${pad(nTga + 3, 3)}`, user_id: tga[3].id, nama_tga: tga[3].nama, tanggal: addDays(today, -1), jam_mulai: "14:00:00",
    kategori: "Listrik", lokasi: "Area Produksi", activity: "Ganti ballast lampu high bay", request_by: emp[2].nama, departemen: emp[2].departement,
    status: "butuh_part", prioritas: "normal", catatan: "Menunggu ballast 400W dari purchasing", sumber: "tugas", assigned_by: "Rina Kusuma",
    assigned_at: ago(24), accepted_at: ago(23), created_at: ago(24), updated_at: ago(23),
  });
  const tgaCnt = new Map<string, number>();
  for (const a of T("tga_activities")) {
    const period = a.ref_no.slice(4, 8), num = Number(a.ref_no.slice(9));
    tgaCnt.set(period, Math.max(tgaCnt.get(period) ?? 0, num));
  }
  for (const [period, last] of tgaCnt) put("tga_counters", { period, last });
  put("tga_assign_config", { id: 1, code: "DEMO2026", code_hash: "", aktif: true, failed_count: 0, locked_until: null, updated_at: NOW, updated_by: "Admin ISS" });

  /* ════ Singleton & log aktivitas ════ */
  put("atk_sync_config", { id: 1, sync_key: "demo-atk-key", last_push_at: ago(2), last_pull_at: ago(1), last_pull_count: 0 });
  const ACT_TABLES = ["claims", "kantong", "drivers", "employees", "job_types", "tasks"];
  const staffActors = STAFF.filter((s) => s.role !== "management");
  const pickRec = (tbl: string): Row => { const rows = T(tbl); return rows[Math.floor(R() * rows.length)]; };
  const logs: Row[] = [];
  for (let i = 0; i < 40; i++) {
    const s = staffActors[Math.floor(R() * staffActors.length)];
    const tbl = ACT_TABLES[Math.floor(R() * ACT_TABLES.length)];
    const r = R();
    const action = r < 0.45 ? "INSERT" : r < 0.9 ? "UPDATE" : "DELETE";
    const rec = pickRec(tbl);
    const nd: Row =
      tbl === "tasks" ? { tujuan: rec.tujuan, status: rec.status, tanggal: rec.tanggal }
      : tbl === "claims" ? { period_date: rec.period_date, total: rec.total }
      : tbl === "kantong" ? { plant: rec.plant, period: rec.period, cash_available: rec.cash_available }
      : tbl === "drivers" ? { nama: rec.nama, plant: rec.plant }
      : tbl === "employees" ? { nama: rec.nama, departement: rec.departement }
      : { label: rec.label };
    const row: Row = {
      id: uuid(), actor_name: s.nama.replace(/ \(.*\)$/, ""), actor_role: s.role, actor_plant: s.plant ?? "CIK", action, table_name: tbl,
      record_id: String(rec.id), created_at: ago(R() * 24 * 14),
    };
    if (action === "DELETE") row.old_data = nd; else row.new_data = nd;
    logs.push(row);
  }
  logs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).forEach((l) => put("activity_log", l));

  /* ════ tabel tanpa data awal ════ */
  for (const t of [
    "activity_log", "agenda_events", "announcements", "app_settings", "atk_items", "atk_requests", "atk_restocks", "atk_sync_config", "canteen_reports", "claims",
    "condolence_wreaths", "driver_claim_requests", "driver_tiers", "drivers", "employee_requests", "employees", "ga_events", "ga_improvements", "ga_inventory",
    "ga_jobs", "ga_manpower", "ga_plan", "ga_plan_resets", "ga_sync_config", "ga_tga", "gas_stations", "gift_events", "gift_registrations", "gift_verify_attempts",
    "job_types", "kantong", "lockers", "overtime", "printer_requests", "printers", "profiles", "push_subscriptions", "rcp_contacts", "rcp_counters", "rcp_parcels",
    "rcp_room_bookings", "rcp_settings", "rcp_wifi_accounts", "rcp_wifi_grants", "security_config", "security_monthly", "tasks", "tga_activities",
    "tga_assign_config", "tga_counters", "tga_sessions", "tga_users", "vehicle_doc_notifications", "vehicle_gate_logs", "vehicles", "auth_users",
  ]) T(t);

  return db;
}
