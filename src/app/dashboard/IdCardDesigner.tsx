"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { L } from "@/lib/i18n";
import { a4Grid, getDefaultDesign, preloadDesign, renderCard, shrinkImageFile, type CardDesign, type LogoDef, type ZoneKey } from "@/lib/idcard/render";
import { saveDesign } from "@/lib/idcardApi";
import s from "./idcard.module.css";

/* ════════════════════════════════════════════════════════════
   CARD DESIGNER — template latar, ukuran kartu, 3 zona teks, dan logo tambahan. Tersimpan di database (dipakai semua admin).
════════════════════════════════════════════════════════════ */

const MM_TO_PX = 200 / 25.4; // 200 dpi
const ZONES: { key: ZoneKey; title: () => string; token: string; y: [number, number]; f: [number, number] }[] = [
  { key: "line1", title: () => L("Baris 1 — Jenis Kartu", "Line 1 — Card type"), token: "{typeLabel}", y: [15, 50], f: [5, 20] },
  { key: "line2", title: () => L("Baris 2 — Lokasi", "Line 2 — Location"), token: "{line2}", y: [20, 60], f: [5, 20] },
  { key: "idNum", title: () => L("Nomor Kartu", "Card number"), token: "{idNum}", y: [48, 80], f: [5, 22] },
];
const SAMPLE = { typeLabel: "CONTRACTOR", line2: "CIKARANG", idNum: "231126001" };

export default function IdCardDesigner({ design, actor, onSaved, notify }: { design: CardDesign; actor: string; onSaved: (d: CardDesign) => void; notify: (msg: string, err?: boolean) => void }) {
  const [d, setD] = useState<CardDesign>(() => JSON.parse(JSON.stringify(design)));
  const [zoom, setZoom] = useState(1.5);
  const [saving, setSaving] = useState(false);
  const cvs = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(async (x: CardDesign) => {
    const c = cvs.current;
    if (!c) return;
    await preloadDesign(x);
    const w = Math.round(x.cardW * MM_TO_PX), h = Math.round(x.cardH * MM_TO_PX);
    c.width = w; c.height = h;
    renderCard(c.getContext("2d")!, 0, 0, w, h, SAMPLE, x);
  }, []);
  useEffect(() => { draw(d); }, [d, draw]);

  const patch = (fn: (x: CardDesign) => void) => setD((p) => { const n = JSON.parse(JSON.stringify(p)) as CardDesign; fn(n); return n; });
  const zone = (k: ZoneKey, prop: string, v: number | string | boolean) => patch((n) => { (n.zones[k] as unknown as Record<string, unknown>)[prop] = v; });
  const logo = (id: string, prop: keyof LogoDef, v: number | string | boolean) => patch((n) => { const l = n.logos.find((x) => x.id === id); if (l) (l as unknown as Record<string, unknown>)[prop] = v; });

  async function setBg(f: File | undefined | null) {
    if (!f) return;
    try { const src = await shrinkImageFile(f, 1400); patch((n) => { n.bgImg = src; }); notify(L("Background diperbarui", "Background updated")); } catch (e) { notify(e instanceof Error ? e.message : String(e), true); }
  }
  async function setLogo(id: string, f: File | undefined | null) {
    if (!f) return;
    try { const src = await shrinkImageFile(f, 600, true); patch((n) => { const l = n.logos.find((x) => x.id === id); if (l) { l.src = src; l.visible = true; } }); notify(L("Logo ditambahkan", "Logo added")); } catch (e) { notify(e instanceof Error ? e.message : String(e), true); }
  }
  const pasted = (e: React.ClipboardEvent) => { const it = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/")); return it ? it.getAsFile() : null; };

  async function save() {
    setSaving(true);
    try { await saveDesign(d, actor); onSaved(d); notify(L("Template disimpan", "Template saved")); } catch (e) { notify(e instanceof Error ? e.message : String(e), true); }
    setSaving(false);
  }
  function reset() {
    if (!window.confirm(L("Reset semua ke default?", "Reset everything to default?"))) return;
    setD(getDefaultDesign());
  }

  const grid = a4Grid(d.cardW, d.cardH);
  const dirty = JSON.stringify(d) !== JSON.stringify(design);

  return (
    <div className={s.designer}>
      {/* kiri */}
      <div className={s.wrap}>
        <div className={s.panel}>
          <div className={s.panelHead}>🖼 {L("Template Background", "Background template")}</div>
          <div className={s.panelBody}>
            <div className={s.paste} tabIndex={0} onPaste={(e) => { const f = pasted(e); if (f) setBg(f); else notify(L("Tidak ada gambar di clipboard. Salin gambar dulu lalu Ctrl+V.", "No image on the clipboard. Copy an image first, then Ctrl+V."), true); }}
              onDrop={(e) => { e.preventDefault(); setBg(e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()}>
              <input type="file" accept="image/*" aria-label={L("Pilih gambar template", "Choose template image")} onChange={(e) => { setBg(e.target.files?.[0]); e.target.value = ""; }} />
              <span style={{ fontSize: 24 }}>🖼</span>
              <b>Ctrl+V {L("tempel, klik, atau seret", "paste, click, or drag")}</b>
              <small>{L("Ganti background template kartu", "Replace the card background template")}</small>
            </div>
            <button type="button" className={`${s.btn} ${s.sm}`} onClick={() => patch((n) => { n.bgImg = null; })}>↺ {L("Pakai template default", "Use default template")}</button>
          </div>
        </div>

        <div className={s.panel}>
          <div className={s.panelHead}>📏 {L("Ukuran Kartu", "Card size")}</div>
          <div className={s.panelBody}>
            <div className={s.row2}>
              <label className={s.field}>{L("Lebar (mm)", "Width (mm)")}<input type="number" min={30} max={150} step={0.5} value={d.cardW} onChange={(e) => patch((n) => { n.cardW = Number(e.target.value) || 54; })} /></label>
              <label className={s.field}>{L("Tinggi (mm)", "Height (mm)")}<input type="number" min={50} max={200} step={0.5} value={d.cardH} onChange={(e) => patch((n) => { n.cardH = Number(e.target.value) || 85; })} /></label>
            </div>
            <span className={s.hint}>{grid.cols * grid.rows} {L("kartu/halaman", "cards/page")} ({grid.cols}×{grid.rows}) {L("pada A4", "on A4")}</span>
          </div>
        </div>

        <div className={s.panel}>
          <div className={s.panelHead}>🖼 {L("Logo Tambahan", "Extra logos")}<div className="right" style={{ marginLeft: "auto" }}><button type="button" className={`${s.btn} ${s.sm}`} onClick={() => patch((n) => { n.logos.push({ id: `logo-${Date.now()}`, name: "Logo", src: "", visible: false, x: 20, y: 10, width: 25, height: 18 }); })}>+ {L("Tambah", "Add")}</button></div></div>
          <div className={s.panelBody}>
            {d.logos.length === 0 && <span className={s.hint}>{L('Belum ada logo tambahan. Klik "+ Tambah".', 'No extra logos yet. Click "+ Add".')}</span>}
            {d.logos.map((l, i) => (
              <div key={l.id} className={s.logoBox}>
                <div className={s.sumRow}><b style={{ fontSize: 12.5, color: "var(--brand)" }}>Logo {i + 1}</b><button type="button" className={`${s.iconBtn} ${s.iconDanger}`} onClick={() => patch((n) => { n.logos = n.logos.filter((x) => x.id !== l.id); })} aria-label={L("Hapus logo", "Remove logo")}>✕</button></div>
                <div className={s.paste} tabIndex={0} style={{ minHeight: 56 }} onPaste={(e) => { const f = pasted(e); if (f) setLogo(l.id, f); }} onDrop={(e) => { e.preventDefault(); setLogo(l.id, e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()}>
                  <input type="file" accept="image/*" aria-label={L("Unggah logo", "Upload logo")} onChange={(e) => { setLogo(l.id, e.target.files?.[0]); e.target.value = ""; }} />
                  {l.src ? <img src={l.src} alt="" /> : <span style={{ fontSize: 20 }}>📋</span>}
                  <small>{l.src ? L("Tempel / unggah baru", "Paste / upload new") : L("Ctrl+V atau klik unggah", "Ctrl+V or click to upload")}</small>
                </div>
                {(["x", "y", "width", "height"] as const).map((p) => (
                  <div className={s.prop} key={p}>
                    <label>{p === "x" ? "X %" : p === "y" ? "Y %" : p === "width" ? L("Lebar %", "Width %") : L("Tinggi %", "Height %")}</label>
                    <input type="range" min={p === "width" ? 5 : p === "height" ? 3 : 2} max={p === "width" ? 80 : p === "height" ? 60 : 95} value={l[p]} onChange={(e) => logo(l.id, p, Number(e.target.value))} />
                    <span className={s.pval}>{l[p]}%</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={s.btn} style={{ flex: 1 }} onClick={reset}>↺ Reset</button>
          <button type="button" className={s.btnPrimary} style={{ flex: 1 }} onClick={save} disabled={saving || !dirty}>💾 {saving ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </div>

      {/* tengah */}
      <div className={s.panel} style={{ overflow: "hidden" }}>
        <div className={s.panelHead}>🎨 {L("Preview Kartu Live", "Live card preview")}
          <div className="right" style={{ marginLeft: "auto" }}>
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" style={{ height: 30, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--t1)" }}>
              {[1, 1.5, 2, 2.5].map((z) => <option key={z} value={z}>{z * 100}%</option>)}
            </select>
          </div>
        </div>
        <div className={s.stage}>
          <canvas ref={cvs} style={{ width: Math.round(d.cardW * MM_TO_PX * zoom * 0.5), height: Math.round(d.cardH * MM_TO_PX * zoom * 0.5) }} />
        </div>
        <div className={s.panelBody} style={{ background: "var(--surface2)", fontSize: 12, color: "var(--t3)" }}>{L("Preview memakai data contoh. Perubahan baru dipakai semua admin setelah Simpan.", "The preview uses sample data. Changes apply for all admins after Save.")}</div>
      </div>

      {/* kanan */}
      <div className={s.panel}>
        <div className={s.panelHead}>✏️ {L("Zona Teks", "Text zones")}</div>
        <div className={s.panelBody}>
          <span className={s.hint}>{L("Setiap zona otomatis terisi dari data kartu. Atur posisi Y, ukuran, dan warna.", "Each zone is filled automatically from the card data. Adjust the Y position, size and colour.")}</span>
          {ZONES.map((z) => {
            const v = d.zones[z.key];
            return (
              <div key={z.key} className={s.zone}>
                <b>{z.title()} <em>{z.token}</em></b>
                <div className={s.prop}><label>{L("Posisi Y", "Y position")}</label><input type="range" min={z.y[0]} max={z.y[1]} value={v.y} onChange={(e) => zone(z.key, "y", Number(e.target.value))} /><span className={s.pval}>{v.y}%</span></div>
                <div className={s.prop}><label>{L("Ukuran", "Font size")}</label><input type="range" min={z.f[0]} max={z.f[1]} value={v.fontSize} onChange={(e) => zone(z.key, "fontSize", Number(e.target.value))} /><span className={s.pval}>{v.fontSize}%</span></div>
                <div className={s.prop}><label>{L("Warna", "Colour")}</label><input type="color" value={v.color} onChange={(e) => zone(z.key, "color", e.target.value)} /></div>
                <div className={s.prop}><label>Bold</label>
                  <select value={String(v.bold)} onChange={(e) => zone(z.key, "bold", e.target.value === "true")}><option value="true">Bold</option><option value="false">Normal</option></select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
