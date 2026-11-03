/* Menu kantin mingguan untuk layar TV (/menu-tv) — mengikuti format menu dari vendor kantin:
   • Snack (sarapan / shift 2 / shift 3): beberapa komponen per hari (mis. nasi kuning + tempe orek + timun + kerupuk)
   • Meal: lauk utama A Ayam, B Daging/Ikan, C Telur; special (mis. Sop Daging) hanya di hari tertentu;
     pendamping = sayur + tempe/tahu/dll; buah berbeda tiap hari; nasi, sambal, kerupuk tetap
   Tiap butir: nama, kalori (kkal) dan berat (gram). */

export interface MenuItem { name: string; kcal: number; gram: number }

export interface DayMenu {
  /** Snack: beberapa komponen per hari (nasi kuning, tempe orek, timun, kerupuk, …) */
  snacks: MenuItem[];
  /** Lauk utama: A Ayam, B Daging / Ikan, C Telur */
  main: { daging: MenuItem; ayam: MenuItem; telur: MenuItem };
  /** Special lauk (mis. Sop Daging) — hanya muncul di hari tertentu */
  special?: MenuItem;
  /** Pendamping: sayur, tempe, tahu, perkedel, dll. */
  sides: MenuItem[];
  /** Buah: berbeda tiap hari */
  fruit: MenuItem;
}

export interface WeeklyMenu {
  /** Senin minggu ini, YYYY-MM-DD */
  weekStart: string;
  /** 7 hari, Senin → Minggu */
  days: DayMenu[];
  /** Pasti ada setiap hari & sama sepanjang minggu: nasi, sambal, kerupuk (buah ada per hari) */
  staples: MenuItem[];
}

const it = (name: string, kcal: number, gram: number): MenuItem => ({ name, kcal, gram });
const none = (): MenuItem => ({ name: "", kcal: 0, gram: 0 });

/** Contoh = menu vendor minggu 2–8 November 2026 (lihat docs/contoh-isi-massal-menu.csv). */
export const SAMPLE_DAYS: DayMenu[] = [
  { snacks: [it("Nasi kuning", 180, 75), it("Tempe orek + bihun goreng", 70, 10), it("Timun iris", 49, 10), it("Saus, kerupuk", 25, 10), it("Kerupuk", 70, 10)],
    main: { ayam: it("Ayam rica-rica", 285, 50), daging: it("Daging woku", 220, 40), telur: it("Telur dadar lebar", 222, 40) },
    special: none(), sides: [it("Sop kacang merah", 85, 75), it("Tahu cah cabe ijo", 133, 35)], fruit: it("Semangka", 32, 100) },
  { snacks: [it("Mie kocok", 307, 75), it("Ayam suwir", 80, 30), it("Sambal soto", 80, 30), it("Kerupuk bawang", 3, 10)],
    main: { ayam: it("Ayam panggang taliwang", 274, 50), daging: it("Ikan nila sambal matah", 211, 40), telur: it("Telur bumbu pindang", 0, 0) },
    special: none(), sides: [it("Urapan", 110, 75), it("Tempe gr ketumbar", 157, 35)], fruit: it("Pepaya", 32, 100) },
  { snacks: [it("Ketoprak", 160, 100), it("Tahu, bihun, toge", 142, 100), it("Sambal kacang", 95, 10), it("Kerupuk", 70, 10)],
    main: { ayam: it("Chicken sc teriyaki", 278, 50), daging: none(), telur: it("Telur ceplok sc teriyaki", 228, 40) },
    special: it("Sop Daging", 0, 0), sides: [it("Cap cay kuah", 111, 75), it("Lumpia", 176, 35)], fruit: it("Pisang", 99, 100) },
  { snacks: [it("Bubur ayam", 156, 75), it("Kuah kaldu", 30, 50), it("Sambal", 55, 10), it("Kerupuk", 70, 10)],
    main: { ayam: it("Ayam bakar kecap", 275, 50), daging: it("Lele kremes", 215, 40), telur: it("Telur pindang 2 pcs", 212, 40) },
    special: none(), sides: [it("Tumis labu siam", 111, 75), it("Tempe orek basah", 131, 35)], fruit: it("Melon", 51, 100) },
  { snacks: [it("Pecel mie", 211, 75), it("Pecel sayuran", 98, 10), it("Sambal kacang", 8, 10), it("Bakwan sayur", 70, 10)],
    main: { ayam: it("Ayam gr lengkuas", 279, 50), daging: it("Semur daging", 200, 40), telur: it("Telur dadar rawit lebaar", 222, 40) },
    special: none(), sides: [it("Sayur asem jangan pakai kecipir", 110, 75), it("Tahu Sumedang", 165, 35)], fruit: it("Semangka", 32, 100) },
  { snacks: [it("Lontong sayur", 211, 75), it("Tahu gulai", 98, 10), it("Gulai labu siam", 8, 10), it("Sambal, kerupuk", 70, 10)],
    main: { ayam: it("Ayam kremes", 280, 50), daging: it("Ikan bawal pesmol", 190, 40), telur: it("Telur ceplok bb kecap", 212, 40) },
    special: none(), sides: [it("Sop macaroni", 78, 75), it("Tempe goreng", 142, 35)], fruit: it("Pepaya", 36, 100) },
  { snacks: [it("Bihun goreng bakso + cabe rawit", 280, 75), it("Telur rawis", 80, 30), it("Saus", 3, 10), it("Kerupuk", 70, 10)],
    main: { ayam: it("Ayam kalio", 280, 50), daging: it("Daging cah cabe ijo", 199, 40), telur: it("Fu yunghai sc asam manis", 221, 40) },
    special: none(), sides: [it("Cah sawi putih", 75, 75), it("Tahu bumbu kecap", 168, 35)], fruit: it("Melon", 32, 100) },
];

export const SAMPLE_STAPLES: MenuItem[] = [it("Nasi putih", 450, 250), it("Sambal", 80, 10), it("Kerupuk", 70, 10)];

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
  snacks: [emptyItem(), emptyItem(), emptyItem(), emptyItem()],
  main: { daging: emptyItem(), ayam: emptyItem(), telur: emptyItem() }, special: emptyItem(), sides: [emptyItem(), emptyItem()], fruit: emptyItem(),
});
/** Nasi, sambal, kerupuk — nilai awal minggu baru (bisa diubah per minggu). */
export const DEFAULT_STAPLES: MenuItem[] = SAMPLE_STAPLES.map((x) => ({ ...x }));
export const emptyWeek = (weekStart: string): WeeklyMenu => ({
  weekStart, days: Array.from({ length: 7 }, emptyDay), staples: DEFAULT_STAPLES.map((x) => ({ ...x })),
});

const clean = (v: unknown): MenuItem => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown) => { const k = Number(x); return Number.isFinite(k) && k > 0 ? Math.round(k * 10) / 10 : 0; };
  return { name: String(o.name ?? "").trim().slice(0, 80), kcal: n(o.kcal), gram: n(o.gram) };
};

/** Bentuk JSON dari database → WeeklyMenu yang pasti lengkap (7 hari). Menerima data lama (snack tunggal). */
export function normalizeWeek(raw: unknown, weekStart: string): WeeklyMenu {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(r.days) ? (r.days as unknown[]) : [];
  const out = emptyWeek(weekStart);
  out.days = Array.from({ length: 7 }, (_, i) => {
    const d = (days[i] && typeof days[i] === "object" ? days[i] : {}) as Record<string, unknown>;
    const m = (d.main && typeof d.main === "object" ? d.main : {}) as Record<string, unknown>;
    const sides = Array.isArray(d.sides) ? (d.sides as unknown[]).map(clean) : [];
    while (sides.length < 2) sides.push(emptyItem());
    // data lama: satu "snack" → jadi daftar berisi satu butir
    const snacks = Array.isArray(d.snacks) ? (d.snacks as unknown[]).map(clean) : d.snack ? [clean(d.snack)] : [];
    while (snacks.length < 4) snacks.push(emptyItem());
    return { snacks, main: { daging: clean(m.daging), ayam: clean(m.ayam), telur: clean(m.telur) }, special: clean(d.special), sides, fruit: clean(d.fruit) };
  });
  if (Array.isArray(r.staples) && r.staples.length) {
    let st = (r.staples as unknown[]).map(clean);
    // data lama: "Buah" ikut di daftar tetap → pindahkan ke kolom buah tiap hari yang belum diisi
    const legacy = st.find((x) => /^buah\b/i.test(x.name));
    if (legacy) { st = st.filter((x) => x !== legacy); out.days.forEach((d) => { if (!hasItem(d.fruit)) d.fruit = { ...legacy }; }); }
    out.staples = st;
  } else if (Array.isArray(r.staples)) out.staples = [];
  return out;
}

/** Simpan hanya butir yang terisi (hemat & rapi). */
export function serializeWeek(w: WeeklyMenu): { days: DayMenu[]; staples: MenuItem[] } {
  const c = (x: MenuItem) => clean(x);
  return {
    days: w.days.map((d) => ({
      snacks: d.snacks.map(c).filter((x) => x.name),
      main: { daging: c(d.main.daging), ayam: c(d.main.ayam), telur: c(d.main.telur) },
      special: c(d.special ?? emptyItem()), sides: d.sides.map(c).filter((x) => x.name), fruit: c(d.fruit ?? emptyItem()),
    })),
    staples: w.staples.map(c).filter((x) => x.name),
  };
}

/** Berapa butir menu utama yang sudah terisi (snack, A/B/C per hari) — indikator kelengkapan. */
export function countFilled(w: WeeklyMenu): { filled: number; total: number } {
  let filled = 0;
  const total = 7 * 4;
  for (const d of w.days) {
    if (d.snacks.some(hasItem)) filled++;
    for (const it of [d.main.daging, d.main.ayam, d.main.telur]) if (hasItem(it)) filled++;
  }
  return { filled, total };
}

/** Total kalori snack satu hari (jumlah semua komponen). */
export const snackTotal = (d: DayMenu): number => Math.round(d.snacks.filter(hasItem).reduce((a, x) => a + (x.kcal || 0), 0));
