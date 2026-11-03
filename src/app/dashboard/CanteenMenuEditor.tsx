"use client";

/* ═══════════════════════════════════════════════════════════
   KANTIN → MENU TV — input menu mingguan untuk layar TV (/menu-tv).
   • Pilih minggu (Senin–Minggu), isi per hari: Snack (1), Lauk utama (Daging, Ayam, Telur),
     Special (opsional, mis. soto), Pendamping (tempe, tahu, perkedel…), dan "Selalu tersedia" (nasi, sambal, kerupuk, buah).
   • Tiap butir: nama, kalori (kkal), gram. Nama yang pernah dipakai terisi otomatis kalori & gramnya.
   • Salin dari minggu lalu, simpan, dan buka tampilan TV.
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import m from "./canteenMenu.module.css";
import { L, loc } from "@/lib/i18n";
import { addDaysIso, countFilled, emptyItem, emptyWeek, hasItem, mondayOf, serializeWeek, SAMPLE_DAYS, SAMPLE_STAPLES, type MenuItem, type WeeklyMenu } from "@/lib/canteenMenu";
import { getMenuWeek, getRecentMenuWeeks, saveMenuWeek } from "@/lib/canteenMenuApi";

type Slot = "snack" | "daging" | "ayam" | "telur" | "special";
const wibToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(loc(), { ...o, timeZone: "UTC" });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const snapshot = (w: WeeklyMenu) => JSON.stringify(serializeWeek(w));

function ItemRow({ label, color, item, onChange, onBlurName, onRemove, placeholder }: {
  label: string; color: string; item: MenuItem; onChange: (p: Partial<MenuItem>) => void; onBlurName: () => void; onRemove?: () => void; placeholder?: string;
}) {
  const filled = hasItem(item);
  const missing = filled && (!item.kcal || !item.gram);
  return (
    <div className={m.row}>
      <span className={m.tag} style={{ ["--c" as string]: color }}>{label}</span>
      <input className={m.name} list="cm-names" value={item.name} placeholder={placeholder ?? L("Nama menu", "Dish name")} maxLength={80}
        onChange={(e) => onChange({ name: e.target.value })} onBlur={onBlurName} aria-label={`${label} — ${L("nama menu", "dish name")}`} />
      <input className={`${m.num} ${missing && !item.kcal ? m.warn : ""}`} type="number" min={0} step={1} inputMode="numeric" value={item.kcal || ""} placeholder="kkal"
        onChange={(e) => onChange({ kcal: Number(e.target.value) || 0 })} aria-label={`${label} — ${L("kalori", "calories")}`} />
      <input className={`${m.num} ${missing && !item.gram ? m.warn : ""}`} type="number" min={0} step={1} inputMode="numeric" value={item.gram || ""} placeholder="gram"
        onChange={(e) => onChange({ gram: Number(e.target.value) || 0 })} aria-label={`${label} — gram`} />
      {onRemove ? <button type="button" className={m.x} onClick={onRemove} aria-label={L("Hapus baris", "Remove row")} title={L("Hapus baris", "Remove row")}>×</button> : <span className={m.xSpace} />}
    </div>
  );
}

export default function CanteenMenuEditor() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(wibToday()));
  const [menu, setMenu] = useState<WeeklyMenu>(() => emptyWeek(mondayOf(wibToday())));
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [existsInDb, setExistsInDb] = useState(false);
  const [library, setLibrary] = useState<Map<string, MenuItem>>(new Map());

  const dirty = snapshot(menu) !== saved;

  // perpustakaan nama menu (sampel + minggu-minggu terakhir) untuk isi otomatis kalori/gram
  useEffect(() => {
    let alive = true;
    const lib = new Map<string, MenuItem>();
    const add = (it: MenuItem) => { if (hasItem(it) && it.kcal && it.gram) lib.set(it.name.trim().toLowerCase(), it); };
    const feed = (d: WeeklyMenu["days"][number]) => { add(d.snack); add(d.main.daging); add(d.main.ayam); add(d.main.telur); if (d.special) add(d.special); d.sides.forEach(add); };
    SAMPLE_DAYS.forEach(feed); SAMPLE_STAPLES.forEach(add);
    getRecentMenuWeeks(12).then((ws) => { if (!alive) return; ws.slice().reverse().forEach((w) => { w.days.forEach(feed); w.staples.forEach(add); }); setLibrary(new Map(lib)); }).catch(() => setLibrary(new Map(lib)));
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (ws: string) => {
    setLoading(true); setErr(null); setOk(null);
    try {
      const w = await getMenuWeek(ws);
      const base = w ?? emptyWeek(ws);
      setMenu(base); setSaved(snapshot(base)); setExistsInDb(!!w);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); const b = emptyWeek(ws); setMenu(b); setSaved(snapshot(b)); setExistsInDb(false); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(weekStart); }, [weekStart, load]);

  const gotoWeek = (ws: string) => {
    if (ws === weekStart) return;
    if (dirty && !confirm(L("Ada perubahan yang belum disimpan. Pindah minggu dan buang perubahan?", "You have unsaved changes. Switch week and discard them?"))) return;
    setWeekStart(ws);
  };

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)), [weekStart]);
  const period = `${fmt(dates[0], { day: "numeric", month: "short" })} – ${fmt(dates[6], { day: "numeric", month: "short", year: "numeric" })}`;
  const prog = countFilled(menu);

  const patchSlot = (d: number, slot: Slot, p: Partial<MenuItem>) => setMenu((cur) => {
    const n = clone(cur); const day = n.days[d];
    if (slot === "snack") day.snack = { ...day.snack, ...p };
    else if (slot === "special") day.special = { ...(day.special ?? emptyItem()), ...p };
    else day.main[slot] = { ...day.main[slot], ...p };
    return n;
  });
  const patchSide = (d: number, i: number, p: Partial<MenuItem>) => setMenu((cur) => { const n = clone(cur); n.days[d].sides[i] = { ...n.days[d].sides[i], ...p }; return n; });
  const addSide = (d: number) => setMenu((cur) => { const n = clone(cur); n.days[d].sides.push(emptyItem()); return n; });
  const delSide = (d: number, i: number) => setMenu((cur) => { const n = clone(cur); n.days[d].sides.splice(i, 1); return n; });
  const patchStaple = (i: number, p: Partial<MenuItem>) => setMenu((cur) => { const n = clone(cur); n.staples[i] = { ...n.staples[i], ...p }; return n; });
  const addStaple = () => setMenu((cur) => { const n = clone(cur); n.staples.push(emptyItem()); return n; });
  const delStaple = (i: number) => setMenu((cur) => { const n = clone(cur); n.staples.splice(i, 1); return n; });

  /** Setelah nama diisi: bila kalori & gram masih kosong dan nama dikenal → isi otomatis. */
  const autofill = (it: MenuItem, apply: (p: Partial<MenuItem>) => void) => {
    if (!hasItem(it) || it.kcal || it.gram) return;
    const hit = library.get(it.name.trim().toLowerCase());
    if (hit) apply({ kcal: hit.kcal, gram: hit.gram });
  };

  const copyPrev = async () => {
    setErr(null); setOk(null);
    if (prog.filled > 0 && !confirm(L("Isi minggu ini akan diganti dengan menu minggu lalu. Lanjutkan?", "This week's content will be replaced by last week's menu. Continue?"))) return;
    try {
      const prev = await getMenuWeek(addDaysIso(weekStart, -7));
      if (!prev) { setErr(L("Minggu lalu belum punya menu untuk disalin.", "Last week has no menu to copy.")); return; }
      setMenu({ ...prev, weekStart });
      setOk(L("Menu minggu lalu disalin. Ubah seperlunya lalu simpan.", "Last week's menu copied. Adjust as needed, then save."));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const clearAll = () => {
    if (!confirm(L("Kosongkan seluruh isian minggu ini?", "Clear everything for this week?"))) return;
    setMenu(emptyWeek(weekStart)); setOk(null);
  };

  const save = async () => {
    setSaving(true); setErr(null); setOk(null);
    try {
      await saveMenuWeek(menu);
      setSaved(snapshot(menu)); setExistsInDb(true);
      const noNum = [...menu.days.flatMap((d) => [d.snack, d.main.daging, d.main.ayam, d.main.telur, d.special ?? emptyItem(), ...d.sides]), ...menu.staples].filter((x) => hasItem(x) && (!x.kcal || !x.gram)).length;
      setOk(noNum ? L(`Tersimpan. ${noNum} menu belum punya kalori/gram — layar TV menampilkannya apa adanya.`, `Saved. ${noNum} dishes have no calories/grams yet — the TV shows them as they are.`) : L("Tersimpan. Layar TV akan memakai menu ini.", "Saved. The TV screen will use this menu."));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const names = useMemo(() => [...library.values()].map((x) => x.name).sort(), [library]);
  const isThisWeek = weekStart === mondayOf(wibToday());

  const MAIN: ["daging" | "ayam" | "telur", string, string][] = [["daging", L("Daging", "Beef"), "#e0533d"], ["ayam", L("Ayam", "Chicken"), "#ec9a17"], ["telur", L("Telur", "Egg"), "#c9a227"]];

  return (
    <div className={m.wrap}>
      <div className={m.toolbar}>
        <div className={m.period}>
          <button type="button" className={m.navBtn} onClick={() => gotoWeek(addDaysIso(weekStart, -7))} aria-label={L("Minggu sebelumnya", "Previous week")}>‹</button>
          <div className={m.periodText}><b>{period}</b><small>{isThisWeek ? L("Minggu ini", "This week") : L("Senin – Minggu", "Monday – Sunday")}</small></div>
          <button type="button" className={m.navBtn} onClick={() => gotoWeek(addDaysIso(weekStart, 7))} aria-label={L("Minggu berikutnya", "Next week")}>›</button>
        </div>
        <input className={m.date} type="date" value={weekStart} onChange={(e) => e.target.value && gotoWeek(mondayOf(e.target.value))} aria-label={L("Pilih tanggal (otomatis ke Senin minggunya)", "Pick a date (jumps to that week's Monday)")} />
        {!isThisWeek && <button type="button" className={m.ghost} onClick={() => gotoWeek(mondayOf(wibToday()))}>{L("Minggu ini", "This week")}</button>}
        <span className={`${m.pill} ${dirty ? m.pillWarn : prog.filled === prog.total ? m.pillOk : ""}`}>
          {dirty ? L("Belum disimpan", "Unsaved") : existsInDb ? L(`Tersimpan · ${prog.filled}/${prog.total} menu utama`, `Saved · ${prog.filled}/${prog.total} main items`) : L("Belum diisi", "Not filled yet")}
        </span>
        <div className={m.grow} />
        <button type="button" className={m.ghost} onClick={copyPrev} disabled={loading}>{L("Salin dari minggu lalu", "Copy from last week")}</button>
        <button type="button" className={m.ghost} onClick={clearAll} disabled={loading}>{L("Kosongkan", "Clear")}</button>
        <a className={m.ghost} href={`/menu-tv?date=${weekStart}`} target="_blank" rel="noreferrer">{L("Lihat di TV ↗", "Preview on TV ↗")}</a>
        <button type="button" className={m.save} onClick={save} disabled={saving || loading || !dirty}>{saving ? L("Menyimpan…", "Saving…") : L("Simpan menu", "Save menu")}</button>
      </div>

      {err && <div className={m.err} role="alert">{err}</div>}
      {ok && <div className={m.ok} role="status">{ok}</div>}
      <p className={m.help}>
        {L("Isi nama menu, kalori (kkal) dan berat (gram). Nama yang pernah dipakai terisi otomatis. Special (mis. soto) cukup diisi di hari yang ada; kosongkan bila tidak ada. Kolom yang namanya kosong tidak ditampilkan di TV.",
           "Enter the dish name, calories (kcal) and weight (grams). Names used before autofill. Fill Special (e.g. soto) only on days that have one; leave it empty otherwise. Rows without a name are not shown on the TV.")}
      </p>

      <datalist id="cm-names">{names.map((n) => <option key={n} value={n} />)}</datalist>

      {loading ? <div className={m.loading}>{L("Memuat menu…", "Loading menu…")}</div> : (
        <>
          <div className={m.days}>
            {menu.days.map((d, i) => {
              const today = dates[i] === wibToday();
              return (
                <section key={i} className={`${m.day} ${today ? m.today : ""}`}>
                  <header className={m.dayHead}>
                    <b>{fmt(dates[i], { weekday: "long" })}</b><span>{fmt(dates[i], { day: "numeric", month: "short" })}</span>
                    {today && <em>{L("Hari ini", "Today")}</em>}
                  </header>
                  <div className={m.cols}><span /><span>{L("Menu", "Dish")}</span><span>kkal</span><span>gram</span><span /></div>
                  <ItemRow label="Snack" color="#0f8a5f" item={d.snack} onChange={(p) => patchSlot(i, "snack", p)} onBlurName={() => autofill(d.snack, (p) => patchSlot(i, "snack", p))} />
                  {MAIN.map(([k, label, col]) => (
                    <ItemRow key={k} label={label} color={col} item={d.main[k]} onChange={(p) => patchSlot(i, k, p)} onBlurName={() => autofill(d.main[k], (p) => patchSlot(i, k, p))} />
                  ))}
                  <ItemRow label="Special" color="#b98425" item={d.special ?? emptyItem()} placeholder={L("mis. Soto Ayam (kosongkan bila tidak ada)", "e.g. Chicken Soto (leave empty if none)")}
                    onChange={(p) => patchSlot(i, "special", p)} onBlurName={() => autofill(d.special ?? emptyItem(), (p) => patchSlot(i, "special", p))} />
                  {d.sides.map((sd, k) => (
                    <ItemRow key={k} label={L(`Pendamping ${k + 1}`, `Side ${k + 1}`)} color="#4d8dff" item={sd} placeholder={L("mis. Tempe Orek / Tahu / Perkedel", "e.g. Tempeh / Tofu / Fritter")}
                      onChange={(p) => patchSide(i, k, p)} onBlurName={() => autofill(sd, (p) => patchSide(i, k, p))} onRemove={d.sides.length > 1 ? () => delSide(i, k) : undefined} />
                  ))}
                  <button type="button" className={m.add} onClick={() => addSide(i)}>+ {L("Pendamping", "Side")}</button>
                </section>
              );
            })}
          </div>

          <section className={`${m.day} ${m.staples}`}>
            <header className={m.dayHead}><b>{L("Selalu tersedia", "Always served")}</b><span>{L("setiap hari minggu ini — nasi, sambal, kerupuk, buah", "every day this week — rice, sambal, crackers, fruit")}</span></header>
            <div className={m.cols}><span /><span>{L("Menu", "Dish")}</span><span>kkal</span><span>gram</span><span /></div>
            {menu.staples.map((st, i) => (
              <ItemRow key={i} label={L("Tetap", "Fixed")} color="#0fb5a4" item={st} onChange={(p) => patchStaple(i, p)} onBlurName={() => autofill(st, (p) => patchStaple(i, p))} onRemove={() => delStaple(i)} />
            ))}
            <button type="button" className={m.add} onClick={addStaple}>+ {L("Menu tetap", "Fixed item")}</button>
          </section>
        </>
      )}
    </div>
  );
}
