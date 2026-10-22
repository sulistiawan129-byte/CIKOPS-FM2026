"use client";

/* /tugas-tga — Form penugasan TGA untuk SEMUA staf GA (tanpa akun dashboard).
   Dilindungi kode penugasan yang diatur admin di Dashboard → TGA → Form penugasan.
   Tugas masuk ke Papan tugas dan HP teknisi langsung berdering (supabase 04, bagian 045). */

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./tugas.module.css";
import { useTheme } from "@/lib/providers";
import { notifyTgaTask } from "@/lib/push";
import { TGA_CATEGORIES, tgaAssignPublic, tgaAssignPublicInfo, type TgaAssignInfo } from "@/lib/tga/api";

const CODE_KEY = "cikops_tga_assign_code";
const NAME_KEY = "cikops_tga_assign_name";
const get = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const put = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* privat */ } };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const hueOf = (n: string) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

interface Draft { by: string; userId: string; kategori: string; activity: string; lokasi: string; urgent: boolean; reqName: string; reqId: string; dept: string; phone: string; catatan: string }
const empty = (by: string): Draft => ({ by, userId: "", kategori: "", activity: "", lokasi: "", urgent: false, reqName: "", reqId: "", dept: "", phone: "", catatan: "" });

export default function TugasTgaPage() {
  const { theme, toggleTheme } = useTheme();
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<TgaAssignInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  // Ikon tema baru dirender setelah mount supaya tidak beda dengan HTML server
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const enter = useCallback(async (c: string, silent = false) => {
    setChecking(true); setCodeErr(null);
    try {
      const r = await tgaAssignPublicInfo(c.trim().toUpperCase());
      put(CODE_KEY, c.trim().toUpperCase()); setCode(c.trim().toUpperCase()); setInfo(r);
    } catch (e) {
      put(CODE_KEY, null);
      if (!silent) { setCodeErr(e instanceof Error ? e.message : String(e)); setShake(true); setTimeout(() => setShake(false), 500); }
    } finally { setChecking(false); }
  }, []);
  useEffect(() => { const c = get(CODE_KEY); if (c) enter(c, true); else setChecking(false); }, [enter]);

  const themeBtn = (
    <button type="button" className={s.iconBtn} onClick={toggleTheme} aria-label="Ganti tema">{mounted ? (theme === "dark" ? "☀" : "☾") : ""}</button>
  );

  if (!info) {
    return (
      <div className={s.page}>
        <div className={s.gate}>
          <div className={s.gateHero}>
            <div className={s.blob} />
            <div className={s.topRow}><span className={s.brand}><Glyph /> CIKOPS TGA</span>{themeBtn}</div>
            <h1>Penugasan <em>Teknisi GA</em></h1>
            <p>Khusus staf GA — tugaskan TGA langsung dari HP. HP teknisi akan berdering begitu tugas dikirim.</p>
          </div>
          <form className={`${s.gateCard} ${shake ? s.shake : ""}`} onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 4) enter(code); }}>
            <label htmlFor="kode">Kode penugasan</label>
            <input id="kode" className={s.codeInput} value={code} onChange={(e) => { setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase()); setCodeErr(null); }}
              placeholder="••••••" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} autoFocus disabled={checking} />
            {codeErr && <div className={s.err} role="alert">{codeErr}</div>}
            <button type="submit" className={s.primary} disabled={checking || code.trim().length < 4}>{checking ? "Memeriksa…" : "Masuk →"}</button>
            <small className={s.muted}>Kode diberikan oleh admin GA. Karyawan non-GA silakan pakai <a href="/request">form permintaan</a>.</small>
          </form>
        </div>
      </div>
    );
  }

  return <AssignForm info={info} code={code} themeBtn={themeBtn} onLogout={() => { put(CODE_KEY, null); setInfo(null); setCode(""); }} onCodeInvalid={(m) => { put(CODE_KEY, null); setInfo(null); setCodeErr(m); }} />;
}

function AssignForm({ info, code, themeBtn, onLogout, onCodeInvalid }: {
  info: TgaAssignInfo; code: string; themeBtn: React.ReactNode; onLogout: () => void; onCodeInvalid: (msg: string) => void;
}) {
  const [d, setD] = useState<Draft>(() => empty(get(NAME_KEY)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; to: string } | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const cat = TGA_CATEGORIES.find((c) => c.id === d.kategori);
  const emps = info.employees;
  const reqMatches = useMemo(() => {
    const q = d.reqName.trim().toLowerCase();
    if (q.length < 2 || d.reqId) return [];
    return emps.filter((e) => e.nama.toLowerCase().includes(q)).slice(0, 6);
  }, [d.reqName, d.reqId, emps]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (d.by.trim().length < 2) { setErr("Isi nama Anda (pemberi tugas)."); return; }
    if (d.activity.trim().length < 3) { setErr("Isi pekerjaan yang harus dikerjakan."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await tgaAssignPublic(code, d.userId || null, {
        assigned_by: d.by.trim(), kategori: d.kategori || "Lainnya", activity: d.activity, lokasi: d.lokasi,
        prioritas: d.urgent ? "urgent" : "normal", request_by: d.reqName, requestor_id: d.reqId || null,
        departemen: d.dept, request_phone: d.phone, catatan: d.catatan,
      });
      put(NAME_KEY, d.by.trim());
      notifyTgaTask(r.id);
      setDone({ ref: r.ref_no, to: r.pool ? "semua TGA (siapa cepat)" : r.nama_tga });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : String(e2);
      if (/kode|belum diaktifkan|terkunci/i.test(m)) onCodeInvalid(m); else setErr(m);
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className={s.page}>
        <div className={s.done}>
          <div className={s.doneIcon}>✓</div>
          <h1>Tugas terkirim</h1>
          <p className={s.ref}>{done.ref}</p>
          <p>Dikirim ke <b>{done.to}</b>. HP teknisi berdering — pantau statusnya di dashboard TGA.</p>
          <div className={s.doneBtns}>
            <button type="button" className={s.primary} onClick={() => { setDone(null); setD(empty(d.by)); }}>＋ Tugaskan lagi</button>
            <button type="button" className={s.ghost} onClick={() => { setDone(null); setD((x) => ({ ...empty(x.by), userId: x.userId })); }}>Teknisi yang sama</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.topRow}>
          <span className={s.brand}><Glyph /> Penugasan TGA</span>
          <span className={s.headBtns}>{themeBtn}<button type="button" className={s.textBtn} onClick={onLogout} title="Lupakan kode di perangkat ini">Keluar</button></span>
        </div>
        <h1>Tugaskan teknisi</h1>
        <p>{info.technicians.length} teknisi aktif · HP teknisi berdering saat tugas dikirim</p>
      </header>

      <form className={s.form} onSubmit={submit}>
        <section className={s.sec}>
          <label className={s.label} htmlFor="by"><i>1</i> Nama Anda <em>*</em> <span>pemberi tugas</span></label>
          <input id="by" className={s.input} value={d.by} onChange={(e) => set("by", e.target.value)} placeholder="mis. Rina (GA)" autoComplete="name" />
        </section>

        <section className={s.sec}>
          <span className={s.label}><i>2</i> Teknisi</span>
          <div className={s.techs}>
            <button type="button" className={`${s.tech} ${!d.userId ? s.on : ""}`} onClick={() => set("userId", "")}>
              <span className={s.av} style={{ ["--h" as string]: 220 }}>👥</span><b>Semua TGA</b><small>siapa cepat</small>
            </button>
            {info.technicians.map((u) => (
              <button key={u.id} type="button" className={`${s.tech} ${d.userId === u.id ? s.on : ""}`} onClick={() => set("userId", u.id)}>
                <span className={s.av} style={{ ["--h" as string]: hueOf(u.nama) }}>{initials(u.nama)}</span><b>{u.nama}</b>
                <small className={u.open >= 3 ? s.busy : ""}>{u.open ? `${u.open} tugas terbuka` : "kosong"}</small>
              </button>
            ))}
          </div>
        </section>

        <section className={s.sec}>
          <span className={s.label}><i>3</i> Jenis pekerjaan</span>
          <div className={s.cats}>
            {TGA_CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={`${s.cat} ${d.kategori === c.id ? s.on : ""}`} style={{ ["--h" as string]: c.hue }} onClick={() => set("kategori", d.kategori === c.id ? "" : c.id)}>
                <span>{c.icon}</span>{c.id}
              </button>
            ))}
          </div>
        </section>

        <section className={s.sec}>
          <label className={s.label} htmlFor="act"><i>4</i> Pekerjaan <em>*</em></label>
          {cat && <div className={s.quick}>{cat.quick.map((q) => <button key={q} type="button" onClick={() => set("activity", q)}>{q}</button>)}</div>}
          <textarea id="act" className={s.input} rows={3} value={d.activity} onChange={(e) => set("activity", e.target.value)} placeholder="mis. AC ruang meeting lt. 2 tidak dingin" />
          <div className={s.row2}>
            <input className={s.input} value={d.lokasi} onChange={(e) => set("lokasi", e.target.value)} placeholder="📍 Lokasi" aria-label="Lokasi" />
            <button type="button" className={`${s.urgent} ${d.urgent ? s.urgentOn : ""}`} onClick={() => set("urgent", !d.urgent)} aria-pressed={d.urgent}>
              <span className={s.switch}><span /></span>🔥 Urgent
            </button>
          </div>
        </section>

        <section className={s.sec}>
          <span className={s.label}><i>5</i> Requestor <span>opsional · dari Data Karyawan</span></span>
          <div className={s.reqWrap}>
            <input className={s.input} value={d.reqName} onChange={(e) => setD((x) => ({ ...x, reqName: e.target.value, reqId: "" }))} placeholder="Ketik nama karyawan…" aria-label="Requestor" />
            {d.reqId && <span className={s.linked}>✓ data karyawan</span>}
            {reqMatches.length > 0 && (
              <ul className={s.sugg}>
                {reqMatches.map((e) => (
                  <li key={e.id}><button type="button" onClick={() => setD((x) => ({ ...x, reqName: e.nama, reqId: e.id, dept: e.dept || x.dept }))}><b>{e.nama}</b><small>{e.dept}</small></button></li>
                ))}
              </ul>
            )}
          </div>
          <div className={s.row2}>
            <input className={s.input} value={d.dept} onChange={(e) => set("dept", e.target.value)} placeholder="Departemen" aria-label="Departemen" />
            <input className={s.input} value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="No. HP requestor" inputMode="tel" aria-label="No. HP requestor" />
          </div>
          <input className={s.input} value={d.catatan} onChange={(e) => set("catatan", e.target.value)} placeholder="Catatan untuk teknisi (opsional)" aria-label="Catatan" />
        </section>

        {err && <div className={s.err} role="alert">{err}</div>}
        <div className={s.foot}>
          <button type="submit" className={s.primary} disabled={busy}>{busy ? "Mengirim…" : `🔔 Kirim ke ${d.userId ? info.technicians.find((u) => u.id === d.userId)?.nama ?? "teknisi" : "semua TGA"}`}</button>
        </div>
      </form>
    </div>
  );
}

function Glyph() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
