/* Menu kantin mingguan untuk layar TV (/menu-tv).
   Struktur data sudah final; isinya masih CONTOH sampai ada input menu di Dashboard → Kantin.
   Tiap butir menu: nama, kalori (kkal) dan berat (gram). */

export interface MenuItem { name: string; kcal: number; gram: number }

export interface DayMenu {
  /** Snack / sarapan: 1 jenis per hari */
  snack: MenuItem;
  /** Lauk utama: selalu 3 pilihan */
  main: { daging: MenuItem; ayam: MenuItem; telur: MenuItem };
  /** Special lauk (mis. soto) — hanya muncul di hari tertentu */
  special?: MenuItem;
  /** Menu pendamping: tempe, tahu, perkedel, dll. */
  sides: MenuItem[];
}

export interface WeeklyMenu {
  /** Senin minggu ini, YYYY-MM-DD */
  weekStart: string;
  /** 7 hari, Senin → Minggu */
  days: DayMenu[];
  /** Pasti ada setiap hari: nasi, sambal, kerupuk, buah */
  staples: MenuItem[];
}

const it = (name: string, kcal: number, gram: number): MenuItem => ({ name, kcal, gram });

export const SAMPLE_DAYS: DayMenu[] = [
  { snack: it("Bubur Kacang Hijau", 180, 150),
    main: { daging: it("Rendang Sapi", 285, 70), ayam: it("Ayam Goreng Kremes", 310, 90), telur: it("Telur Balado", 140, 60) },
    sides: [it("Tempe Orek", 120, 40), it("Tahu Goreng", 95, 50)] },
  { snack: it("Pisang Goreng", 210, 100),
    main: { daging: it("Semur Daging", 260, 75), ayam: it("Ayam Bakar Madu", 260, 90), telur: it("Telur Dadar Padang", 160, 60) },
    sides: [it("Perkedel Kentang", 130, 45), it("Tempe Mendoan", 140, 45)] },
  { snack: it("Roti Isi Cokelat", 240, 90),
    main: { daging: it("Empal Gepuk", 270, 70), ayam: it("Ayam Lada Hitam", 280, 90), telur: it("Telur Bumbu Bali", 150, 60) },
    sides: [it("Tahu Bacem", 100, 50), it("Tempe Goreng Tepung", 150, 40)] },
  { snack: it("Lemper Ayam", 190, 80),
    main: { daging: it("Sapi Lada Hitam", 275, 70), ayam: it("Ayam Woku", 270, 90), telur: it("Semur Telur", 145, 60) },
    special: it("Soto Ayam Lamongan", 320, 250),
    sides: [it("Perkedel Jagung", 135, 45), it("Tahu Isi", 110, 50)] },
  { snack: it("Kue Lapis", 170, 75),
    main: { daging: it("Bistik Jawa", 255, 75), ayam: it("Ayam Goreng Lengkuas", 300, 90), telur: it("Telur Ceplok Kecap", 150, 60) },
    sides: [it("Tempe Kemangi", 115, 40), it("Tahu Crispy", 120, 50)] },
  { snack: it("Onde-onde", 200, 70),
    main: { daging: it("Daging Balado", 280, 70), ayam: it("Ayam Asam Manis", 285, 90), telur: it("Telur Dadar Sayur", 155, 60) },
    sides: [it("Perkedel Tahu", 125, 45), it("Tempe Bacem", 125, 40)] },
  { snack: it("Kolak Pisang", 220, 180),
    main: { daging: it("Tongseng Sapi", 290, 80), ayam: it("Ayam Panggang Bumbu Rujak", 275, 90), telur: it("Telur Rica-rica", 160, 60) },
    sides: [it("Tahu Goreng", 95, 50), it("Tempe Orek Kering", 130, 40)] },
];

export const SAMPLE_STAPLES: MenuItem[] = [
  it("Nasi Putih", 260, 200), it("Sambal", 30, 20), it("Kerupuk", 45, 10), it("Buah Potong", 50, 80),
];

/** Senin dari minggu yang memuat `isoDate` (YYYY-MM-DD). */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Senin = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export const addDaysIso = (isoDate: string, n: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Contoh menu untuk minggu yang memuat `isoDate`. */
export function sampleWeek(isoDate: string): WeeklyMenu {
  return { weekStart: mondayOf(isoDate), days: SAMPLE_DAYS, staples: SAMPLE_STAPLES };
}

/* ── penyimpanan: satu baris per minggu (canteen_menu_weeks.data) ── */
export const emptyItem = (): MenuItem => ({ name: "", kcal: 0, gram: 0 });
/** Butir menu dianggap terisi bila namanya ada. */
export const hasItem = (it?: MenuItem | null): it is MenuItem => !!it && it.name.trim() !== "";
export const emptyDay = (): DayMenu => ({
  snack: emptyItem(), main: { daging: emptyItem(), ayam: emptyItem(), telur: emptyItem() }, special: emptyItem(), sides: [emptyItem(), emptyItem()],
});
/** Nasi, sambal, kerupuk, buah — nilai awal minggu baru (bisa diubah per minggu). */
export const DEFAULT_STAPLES: MenuItem[] = SAMPLE_STAPLES.map((x) => ({ ...x }));
export const emptyWeek = (weekStart: string): WeeklyMenu => ({
  weekStart, days: Array.from({ length: 7 }, emptyDay), staples: DEFAULT_STAPLES.map((x) => ({ ...x })),
});

const clean = (v: unknown): MenuItem => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown) => { const k = Number(x); return Number.isFinite(k) && k > 0 ? Math.round(k * 10) / 10 : 0; };
  return { name: String(o.name ?? "").trim().slice(0, 80), kcal: n(o.kcal), gram: n(o.gram) };
};

/** Bentuk JSON dari database → WeeklyMenu yang pasti lengkap (7 hari). */
export function normalizeWeek(raw: unknown, weekStart: string): WeeklyMenu {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(r.days) ? (r.days as unknown[]) : [];
  const out = emptyWeek(weekStart);
  out.days = Array.from({ length: 7 }, (_, i) => {
    const d = (days[i] && typeof days[i] === "object" ? days[i] : {}) as Record<string, unknown>;
    const m = (d.main && typeof d.main === "object" ? d.main : {}) as Record<string, unknown>;
    const sides = Array.isArray(d.sides) ? (d.sides as unknown[]).map(clean) : [];
    while (sides.length < 2) sides.push(emptyItem());
    return { snack: clean(d.snack), main: { daging: clean(m.daging), ayam: clean(m.ayam), telur: clean(m.telur) }, special: clean(d.special), sides };
  });
  if (Array.isArray(r.staples) && r.staples.length) out.staples = (r.staples as unknown[]).map(clean);
  return out;
}

/** Simpan hanya butir yang terisi (hemat & rapi). */
export function serializeWeek(w: WeeklyMenu): { days: DayMenu[]; staples: MenuItem[] } {
  const c = (x: MenuItem) => clean(x);
  return {
    days: w.days.map((d) => ({
      snack: c(d.snack), main: { daging: c(d.main.daging), ayam: c(d.main.ayam), telur: c(d.main.telur) },
      special: c(d.special ?? emptyItem()), sides: d.sides.map(c).filter((x) => x.name),
    })),
    staples: w.staples.map(c).filter((x) => x.name),
  };
}

/** Berapa butir menu yang sudah terisi (untuk indikator kelengkapan). */
export function countFilled(w: WeeklyMenu): { filled: number; total: number } {
  let filled = 0;
  const total = 7 * 4; // snack + 3 lauk utama per hari
  for (const d of w.days) for (const it of [d.snack, d.main.daging, d.main.ayam, d.main.telur]) if (hasItem(it)) filled++;
  return { filled, total };
}
