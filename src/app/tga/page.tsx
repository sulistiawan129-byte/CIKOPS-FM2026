"use client";

/* /tga — Aplikasi TGA (Teknisi GA): catat kegiatan dari HP.
   Masuk dengan nama + PIN (diatur admin di Dashboard → GA → TGA → Akun aplikasi).
   Bisa di-install ke layar utama HP (PWA, manifest-tga.json). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./tga.module.css";
import {
  TGA_CATEGORIES, TGA_STATUS, isSessionError, tgaCategory, tgaDelete, tgaLogin, tgaLogout, tgaMyData, tgaNames,
  tgaRequestors, tgaSave, tgaStatusLabel, tgaStoredSession,
  type TgaActivity, type TgaDraft, type TgaMyData, type TgaRequestor, type TgaStatus,
} from "@/lib/tga/api";

type Screen = "splash" | "login" | "app";
type Tab = "home" | "open" | "history" | "profile";
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function fmtDay(iso: string, today: string) {
  if (iso === today) return "Hari ini";
  const t = new Date(today + "T00:00:00"); t.setDate(t.getDate() - 1);
  const d = new Date(iso + "T00:00:00");
  if (d.getTime() === t.getTime()) return "Kemarin";
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtLong(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`;
}
function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const hueOf = (n: string) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const firstName = (n: string) => n.split(/\s+/)[0] ?? n;

function emptyDraft(today: string): TgaDraft {
  return { tanggal: today, jam_mulai: nowHM(), jam_selesai: "", kategori: "", lokasi: "", activity: "", request_by: "", departemen: "", status: "selesai", prioritas: "normal", catatan: "" };
}
const draftOf = (a: TgaActivity): TgaDraft => ({
  tanggal: a.tanggal, jam_mulai: a.jam_mulai ?? "", jam_selesai: a.jam_selesai ?? "", kategori: a.kategori, lokasi: a.lokasi, activity: a.activity,
  request_by: a.request_by, departemen: a.departemen, status: a.status, prioritas: a.prioritas, catatan: a.catatan,
});

export default function TgaAppPage() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [data, setData] = useState<TgaMyData | null>(null);
  const [requestors, setRequestors] = useState<TgaRequestor[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<{ id: string | null; draft: TgaDraft } | null>(null);
  const [detail, setDetail] = useState<TgaActivity | null>(null);
  const [saved, setSaved] = useState<{ a: TgaActivity; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const today = data?.today ?? localToday();

  // PWA: service worker + tombol install
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const net = () => setOnline(navigator.onLine);
    net();
    window.addEventListener("online", net); window.addEventListener("offline", net);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", net); window.removeEventListener("offline", net);
    };
  }, []);

  useEffect(() => {
    const ses = tgaStoredSession();
    const t = setTimeout(() => {
      if (ses) { setToken(ses.token); setScreen("app"); } else setScreen("login");
    }, 650);
    return () => clearTimeout(t);
  }, []);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);

  const signOut = useCallback(async (msg?: string) => {
    const tk = token;
    setToken(""); setData(null); setForm(null); setDetail(null); setTab("home"); setScreen("login");
    if (tk) await tgaLogout(tk).catch(() => {});
    if (msg) flash(msg);
  }, [token, flash]);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const d = await tgaMyData(token, 90);
      setData(d); setLoadErr(null);
    } catch (e) {
      if (isSessionError(e)) { signOut("Sesi berakhir — silakan masuk lagi."); return; }
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally { setRefreshing(false); }
  }, [token, signOut]);

  useEffect(() => {
    if (screen !== "app" || !token) return;
    load();
    tgaRequestors(token).then(setRequestors).catch(() => {});
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [screen, token, load]);

  const acts = useMemo(() => data?.activities ?? [], [data]);
  const recentLokasi = useMemo(() => {
    const m = new Map<string, number>();
    acts.forEach((a) => { if (a.lokasi) m.set(a.lokasi, (m.get(a.lokasi) ?? 0) + 1); });
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([l]) => l);
  }, [acts]);

  function upsertLocal(a: TgaActivity) {
    setData((d) => d && ({
      ...d,
      activities: [a, ...d.activities.filter((x) => x.id !== a.id)].sort((x, y) => (y.tanggal.localeCompare(x.tanggal) || y.created_at.localeCompare(x.created_at))),
    }));
  }

  async function quickDone(a: TgaActivity) {
    try {
      const r = await tgaSave(token, a.id, { ...draftOf(a), status: "selesai", jam_selesai: a.jam_selesai || nowHM() });
      upsertLocal(r); setDetail(null); flash(`✓ ${r.ref_no} ditandai selesai`);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e) {
      if (isSessionError(e)) return signOut("Sesi berakhir — silakan masuk lagi.");
      flash(e instanceof Error ? e.message : String(e));
    }
  }
  async function remove(a: TgaActivity) {
    if (!confirm(`Hapus kegiatan ${a.ref_no}?\n"${a.activity}"`)) return;
    try {
      await tgaDelete(token, a.id);
      setData((d) => d && ({ ...d, activities: d.activities.filter((x) => x.id !== a.id), month_count: Math.max(0, d.month_count - (a.tanggal.slice(0, 7) === today.slice(0, 7) ? 1 : 0)) }));
      setDetail(null); flash("Kegiatan dihapus");
    } catch (e) { flash(e instanceof Error ? e.message : String(e)); }
  }

  if (screen === "splash") {
    return (
      <div className={s.splash}>
        <div className={s.splashLogo}><ToolGlyph /></div>
        <b>CIKOPS TGA</b>
        <span>Teknisi GA · Catat kegiatan</span>
      </div>
    );
  }

  if (screen === "login") {
    return <Login onDone={(tk) => { setToken(tk); setScreen("app"); setTab("home"); }} toast={toast} />;
  }

  const nama = data?.nama ?? tgaStoredSession()?.nama ?? "";

  return (
    <div className={s.app}>
      {!online && <div className={s.offline}>Tidak ada koneksi — periksa internet sebelum menyimpan.</div>}
      <header className={s.hero}>
        <div className={s.heroTop}>
          <div className={s.brandMini}><span><ToolGlyph /></span>CIKOPS TGA</div>
          <button type="button" className={`${s.iconBtn} ${refreshing ? s.spin : ""}`} onClick={load} aria-label="Muat ulang">⟳</button>
        </div>
        <p className={s.hello}>{greeting()},</p>
        <h1 className={s.heroName}>{firstName(nama) || "Teknisi"} 👋</h1>
        <p className={s.heroDate}>{fmtLong(today)} · {data?.month_count ?? 0} kegiatan bulan ini</p>
      </header>

      <main className={s.main}>
        {loadErr && <div className={s.errBox}>{loadErr} <button type="button" onClick={load}>Coba lagi</button></div>}
        {!data && !loadErr ? <Skeleton /> : (
          <>
            {tab === "home" && <Home acts={acts} today={today} onOpen={setDetail} onDone={quickDone} onNew={() => setForm({ id: null, draft: emptyDraft(today) })} />}
            {tab === "open" && <OpenList acts={acts} today={today} onOpen={setDetail} onDone={quickDone} />}
            {tab === "history" && <History acts={acts} today={today} onOpen={setDetail} />}
            {tab === "profile" && (
              <Profile nama={nama} acts={acts} monthCount={data?.month_count ?? 0} today={today}
                installEvt={installEvt} installed={installed}
                onInstall={async () => { if (!installEvt) return; await installEvt.prompt(); const c = await installEvt.userChoice; if (c.outcome === "accepted") setInstalled(true); setInstallEvt(null); }}
                onLogout={() => { if (confirm("Keluar dari aplikasi TGA?")) signOut(); }} />
            )}
          </>
        )}
      </main>

      <nav className={s.nav}>
        <NavBtn on={tab === "home"} icon="⌂" label="Beranda" onClick={() => setTab("home")} />
        <NavBtn on={tab === "history"} icon="☰" label="Riwayat" onClick={() => setTab("history")} />
        <button type="button" className={s.fab} onClick={() => setForm({ id: null, draft: emptyDraft(today) })} aria-label="Catat kegiatan baru">
          <span>＋</span>
        </button>
        <NavBtn on={tab === "open"} icon="◷" label="Terbuka" badge={acts.filter((a) => a.status !== "selesai").length} onClick={() => setTab("open")} />
        <NavBtn on={tab === "profile"} icon="◉" label="Profil" onClick={() => setTab("profile")} />
      </nav>

      {detail && (
        <Detail a={detail} today={today} onClose={() => setDetail(null)} onDone={() => quickDone(detail)}
          onEdit={() => { setForm({ id: detail.id, draft: draftOf(detail) }); setDetail(null); }} onDelete={() => remove(detail)} />
      )}

      {form && (
        <FormSheet key={form.id ?? "new"} id={form.id} initial={form.draft} today={today} recentLokasi={recentLokasi} requestors={requestors}
          onClose={() => setForm(null)}
          onSave={async (draft) => {
            const r = await tgaSave(token, form.id, draft);
            upsertLocal(r);
            if (form.id === null) setData((d) => d && ({ ...d, month_count: d.month_count + (r.tanggal.slice(0, 7) === today.slice(0, 7) ? 1 : 0) }));
            setSaved({ a: r, isNew: form.id === null }); setForm(null);
            if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
          }}
          onSessionLost={() => signOut("Sesi berakhir — silakan masuk lagi.")} />
      )}

      {saved && (
        <Success a={saved.a} isNew={saved.isNew} onClose={() => setSaved(null)}
          onAnother={() => { setSaved(null); setForm({ id: null, draft: { ...emptyDraft(today), kategori: saved.a.kategori, lokasi: saved.a.lokasi } }); }} />
      )}

      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

/* ════════════ LOGIN ════════════ */
function Login({ onDone, toast }: { onDone: (token: string) => void; toast: string | null }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [nama, setNama] = useState<string>(() => tgaStoredSession()?.nama ?? "");
  const [step, setStep] = useState<"name" | "pin">("name");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    tgaNames().then((n) => {
      setNames(n);
      try { const last = localStorage.getItem("cikops_tga_name"); if (last && n.includes(last)) { setNama(last); } } catch {}
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const submit = useCallback(async (p: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await tgaLogin(nama, p);
      onDone(r.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setShake(true); setTimeout(() => setShake(false), 500);
      if (navigator.vibrate) navigator.vibrate(120);
      setPin("");
    } finally { setBusy(false); }
  }, [nama, onDone]);

  function press(k: string) {
    if (busy) return;
    if (k === "del") { setPin((p) => p.slice(0, -1)); return; }
    if (k === "ok") { if (pin.length >= 4) submit(pin); return; }
    setPin((p) => {
      const n = (p + k).slice(0, 6);
      if (n.length === 6) setTimeout(() => submit(n), 120);
      return n;
    });
  }

  const list = (names ?? []).filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={s.login}>
      <div className={s.loginHero}>
        <div className={s.blob1} /><div className={s.blob2} />
        <div className={s.loginLogo}><ToolGlyph /></div>
        <h1>CIKOPS <span>TGA</span></h1>
        <p>Catat setiap pekerjaan teknisi GA — cepat, rapi, langsung masuk laporan.</p>
      </div>

      <div className={s.loginCard}>
        {step === "name" ? (
          <>
            <h2>Siapa yang bertugas?</h2>
            <p className={s.sub}>Pilih nama Anda</p>
            {(names?.length ?? 0) > 6 && <input className={s.input} placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} />}
            {err && <div className={s.errBox}>{err}</div>}
            {names === null && !err && <div className={s.nameGrid}>{[0, 1, 2, 3].map((i) => <div key={i} className={s.skelName} />)}</div>}
            {names && names.length === 0 && <div className={s.emptyBox}>Belum ada akun TGA. Minta admin membuatkan akun di Dashboard → GA → TGA.</div>}
            <div className={s.nameGrid}>
              {list.map((n) => (
                <button key={n} type="button" className={`${s.nameBtn} ${nama === n ? s.nameOn : ""}`} onClick={() => { setNama(n); setStep("pin"); setPin(""); setErr(null); }}>
                  <span className={s.avatar} style={{ ["--h" as string]: hueOf(n) }}>{initials(n)}</span>
                  <b>{n}</b>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button type="button" className={s.backLink} onClick={() => { setStep("name"); setErr(null); }}>‹ Ganti nama</button>
            <div className={s.pinWho}>
              <span className={`${s.avatar} ${s.avatarLg}`} style={{ ["--h" as string]: hueOf(nama) }}>{initials(nama)}</span>
              <b>{nama}</b>
              <small>Masukkan PIN Anda</small>
            </div>
            <div className={`${s.dots} ${shake ? s.shake : ""}`}>
              {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? s.dotOn : ""} />)}
            </div>
            <div className={s.pinErr}>{err ?? (busy ? "Memeriksa…" : " ")}</div>
            <div className={s.keypad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].map((k) => (
                <button key={k} type="button" disabled={busy || (k === "ok" && pin.length < 4)}
                  className={k === "ok" ? s.keyOk : k === "del" ? s.keyDel : ""} onClick={() => press(k)} aria-label={k === "del" ? "Hapus" : k === "ok" ? "Masuk" : k}>
                  {k === "del" ? "⌫" : k === "ok" ? "Masuk" : k}
                </button>
              ))}
            </div>
            <p className={s.hint}>Lupa PIN? Hubungi admin GA untuk reset.</p>
          </>
        )}
      </div>
      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

/* ════════════ BERANDA ════════════ */
function Home({ acts, today, onOpen, onDone, onNew }: {
  acts: TgaActivity[]; today: string; onOpen: (a: TgaActivity) => void; onDone: (a: TgaActivity) => void; onNew: () => void;
}) {
  const todayActs = acts.filter((a) => a.tanggal === today);
  const open = acts.filter((a) => a.status !== "selesai");
  const doneToday = todayActs.filter((a) => a.status === "selesai").length;
  const weekStart = (() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - 6); return d; })();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { iso, label: HARI[d.getDay()].slice(0, 3), n: acts.filter((a) => a.tanggal === iso).length };
  });
  const maxW = Math.max(1, ...week.map((w) => w.n));
  const pct = todayActs.length ? Math.round((doneToday / todayActs.length) * 100) : 0;

  return (
    <div className={s.stack}>
      <section className={s.statCard}>
        <div className={s.ring} style={{ ["--p" as string]: pct }}>
          <div><b>{todayActs.length}</b><small>hari ini</small></div>
        </div>
        <div className={s.statList}>
          <div><i className={s.tGreen} /> <span>Selesai</span><b>{doneToday}</b></div>
          <div><i className={s.tBlue} /> <span>Masih terbuka</span><b>{open.length}</b></div>
          <div><i className={s.tRed} /> <span>Urgent terbuka</span><b>{open.filter((a) => a.prioritas === "urgent").length}</b></div>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><h3>7 hari terakhir</h3><span>{week.reduce((x, w) => x + w.n, 0)} kegiatan</span></div>
        <div className={s.week}>
          {week.map((w) => (
            <div key={w.iso} className={w.iso === today ? s.weekOn : ""}>
              <em>{w.n || ""}</em>
              <span style={{ height: `${Math.max(6, (w.n / maxW) * 100)}%` }} />
              <small>{w.label}</small>
            </div>
          ))}
        </div>
      </section>

      {open.length > 0 && (
        <section>
          <div className={s.secHead}><h3>Pekerjaan terbuka</h3><span className={s.badge}>{open.length}</span></div>
          <div className={s.list}>
            {open.slice(0, 8).map((a) => <ActRow key={a.id} a={a} today={today} onOpen={onOpen} onDone={onDone} showDate />)}
          </div>
        </section>
      )}

      <section>
        <div className={s.secHead}><h3>Catatan hari ini</h3><span className={s.badge}>{todayActs.length}</span></div>
        {todayActs.length === 0 ? (
          <button type="button" className={s.emptyCta} onClick={onNew}>
            <span className={s.emptyIcon}>📝</span>
            <b>Belum ada kegiatan hari ini</b>
            <small>Ketuk untuk mencatat pekerjaan pertama Anda</small>
          </button>
        ) : (
          <div className={s.list}>{todayActs.map((a) => <ActRow key={a.id} a={a} today={today} onOpen={onOpen} onDone={onDone} />)}</div>
        )}
      </section>
    </div>
  );
}

function ActRow({ a, today, onOpen, onDone, showDate }: { a: TgaActivity; today: string; onOpen: (a: TgaActivity) => void; onDone?: (a: TgaActivity) => void; showDate?: boolean }) {
  const c = tgaCategory(a.kategori);
  const st = TGA_STATUS.find((x) => x.id === a.status);
  return (
    <div className={s.row} onClick={() => onOpen(a)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(a); }}>
      <span className={s.catIcon} style={{ ["--h" as string]: c.hue }}>{c.icon}</span>
      <div className={s.rowBody}>
        <div className={s.rowTop}>
          <b>{a.activity}</b>
          {a.prioritas === "urgent" && <span className={s.urgent}>URGENT</span>}
        </div>
        <div className={s.rowMeta}>
          {showDate && <span>{fmtDay(a.tanggal, today)}</span>}
          {a.jam_mulai && <span>🕑 {a.jam_mulai}{a.jam_selesai ? `–${a.jam_selesai}` : ""}</span>}
          {a.lokasi && <span>📍 {a.lokasi}</span>}
          {a.request_by && <span>👤 {a.request_by}</span>}
        </div>
      </div>
      {a.status !== "selesai" && onDone ? (
        <button type="button" className={s.doneBtn} onClick={(e) => { e.stopPropagation(); onDone(a); }} aria-label="Tandai selesai" title="Tandai selesai">✓</button>
      ) : (
        <span className={`${s.pill} ${s["t_" + (st?.tone ?? "green")]}`}>{st?.short ?? a.status}</span>
      )}
    </div>
  );
}

/* ════════════ TERBUKA ════════════ */
function OpenList({ acts, today, onOpen, onDone }: { acts: TgaActivity[]; today: string; onOpen: (a: TgaActivity) => void; onDone: (a: TgaActivity) => void }) {
  const open = acts.filter((a) => a.status !== "selesai")
    .sort((x, y) => (x.prioritas === "urgent" ? 0 : 1) - (y.prioritas === "urgent" ? 0 : 1) || x.tanggal.localeCompare(y.tanggal));
  return (
    <div className={s.stack}>
      <div className={s.openSummary}>
        {TGA_STATUS.filter((x) => x.id !== "selesai").map((x) => (
          <div key={x.id} className={s["t_" + x.tone]}><b>{open.filter((a) => a.status === x.id).length}</b><span>{x.label}</span></div>
        ))}
      </div>
      {open.length === 0 ? (
        <div className={s.emptyBox}><span className={s.emptyIcon}>🎉</span><b>Semua pekerjaan selesai</b><small>Tidak ada pekerjaan yang masih terbuka.</small></div>
      ) : (
        <>
          <p className={s.count}>Urgent di atas · ketuk ✓ bila sudah selesai</p>
          <div className={s.list}>{open.map((a) => <ActRow key={a.id} a={a} today={today} onOpen={onOpen} onDone={onDone} showDate />)}</div>
        </>
      )}
    </div>
  );
}

/* ════════════ RIWAYAT ════════════ */
function History({ acts, today, onOpen }: { acts: TgaActivity[]; today: string; onOpen: (a: TgaActivity) => void }) {
  const [q, setQ] = useState("");
  const [st, setSt] = useState<TgaStatus | "">("");
  const [cat, setCat] = useState("");
  const list = acts.filter((a) => (!st || a.status === st) && (!cat || a.kategori === cat) &&
    (!q || [a.activity, a.lokasi, a.request_by, a.departemen, a.ref_no, a.catatan].join(" ").toLowerCase().includes(q.toLowerCase())));
  const groups = useMemo(() => {
    const m = new Map<string, TgaActivity[]>();
    list.forEach((a) => { const g = m.get(a.tanggal) ?? []; g.push(a); m.set(a.tanggal, g); });
    return [...m.entries()];
  }, [list]);

  return (
    <div className={s.stack}>
      <div className={s.searchBox}>
        <span>⌕</span>
        <input placeholder="Cari kegiatan, lokasi, requestor, no. ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Hapus pencarian">✕</button>}
      </div>
      <div className={s.chips}>
        <button type="button" className={!st ? s.chipOn : ""} onClick={() => setSt("")}>Semua</button>
        {TGA_STATUS.map((x) => <button key={x.id} type="button" className={st === x.id ? s.chipOn : ""} onClick={() => setSt(st === x.id ? "" : x.id)}>{x.short}</button>)}
      </div>
      <div className={s.chips}>
        {TGA_CATEGORIES.map((c) => <button key={c.id} type="button" className={cat === c.id ? s.chipOn : ""} onClick={() => setCat(cat === c.id ? "" : c.id)}>{c.icon} {c.id}</button>)}
      </div>
      <p className={s.count}>{list.length} kegiatan · 90 hari terakhir</p>
      {groups.length === 0 ? <div className={s.emptyBox}>Tidak ada kegiatan yang cocok.</div> : groups.map(([d, rows]) => (
        <section key={d}>
          <div className={s.dayHead}><b>{fmtDay(d, today)}</b><span>{rows.length}</span></div>
          <div className={s.list}>{rows.map((a) => <ActRow key={a.id} a={a} today={today} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

/* ════════════ PROFIL ════════════ */
function Profile({ nama, acts, monthCount, today, installEvt, installed, onInstall, onLogout }: {
  nama: string; acts: TgaActivity[]; monthCount: number; today: string;
  installEvt: BeforeInstallPromptEvent | null; installed: boolean; onInstall: () => void; onLogout: () => void;
}) {
  const month = acts.filter((a) => a.tanggal.slice(0, 7) === today.slice(0, 7));
  const byCat = TGA_CATEGORIES.map((c) => ({ ...c, n: month.filter((a) => a.kategori === c.id).length })).filter((c) => c.n > 0).sort((x, y) => y.n - x.n);
  const maxC = Math.max(1, ...byCat.map((c) => c.n));
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const doneRate = month.length ? Math.round((month.filter((a) => a.status === "selesai").length / month.length) * 100) : 0;

  return (
    <div className={s.stack}>
      <section className={s.profileCard}>
        <span className={`${s.avatar} ${s.avatarLg}`} style={{ ["--h" as string]: hueOf(nama) }}>{initials(nama)}</span>
        <b>{nama}</b>
        <small>Teknisi GA · CIKOPS</small>
        <div className={s.profileStats}>
          <div><b>{monthCount}</b><span>Bulan ini</span></div>
          <div><b>{doneRate}%</b><span>Selesai</span></div>
          <div><b>{acts.filter((a) => a.status !== "selesai").length}</b><span>Terbuka</span></div>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><h3>Jenis pekerjaan bulan ini</h3></div>
        {byCat.length === 0 ? <p className={s.muted}>Belum ada kegiatan bulan ini.</p> : (
          <div className={s.catBars}>
            {byCat.map((c) => (
              <div key={c.id}>
                <span>{c.icon} {c.id}</span>
                <i><em style={{ width: `${(c.n / maxC) * 100}%`, ["--h" as string]: c.hue }} /></i>
                <b>{c.n}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><h3>📲 Pasang di HP</h3></div>
        {installed ? <p className={s.muted}>Aplikasi sudah terpasang di layar utama. 👍</p>
          : installEvt ? (
            <>
              <p className={s.muted}>Pasang aplikasi TGA supaya bisa dibuka langsung dari layar utama, seperti aplikasi biasa.</p>
              <button type="button" className={s.primaryBtn} onClick={onInstall}>Pasang aplikasi</button>
            </>
          ) : ios ? (
            <ol className={s.steps}>
              <li>Buka halaman ini di <b>Safari</b>.</li>
              <li>Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas).</li>
              <li>Pilih <b>Tambah ke Layar Utama</b> → <b>Tambah</b>.</li>
            </ol>
          ) : (
            <ol className={s.steps}>
              <li>Buka halaman ini di <b>Chrome</b>.</li>
              <li>Ketuk menu <b>⋮</b> di kanan atas.</li>
              <li>Pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.</li>
            </ol>
          )}
      </section>

      <button type="button" className={s.logoutBtn} onClick={onLogout}>Keluar</button>
      <p className={s.footNote}>CIKOPS-FM · Aplikasi TGA</p>
    </div>
  );
}

/* ════════════ DETAIL ════════════ */
function Detail({ a, today, onClose, onDone, onEdit, onDelete }: {
  a: TgaActivity; today: string; onClose: () => void; onDone: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const c = tgaCategory(a.kategori);
  const st = TGA_STATUS.find((x) => x.id === a.status);
  return (
    <div className={s.sheetWrap} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={s.grab} />
        <div className={s.detailHead} style={{ ["--h" as string]: c.hue }}>
          <span className={s.catIconLg}>{c.icon}</span>
          <div>
            <small>{a.ref_no} · {c.id}</small>
            <h2>{a.activity}</h2>
            <div className={s.detailTags}>
              <span className={`${s.pill} ${s["t_" + (st?.tone ?? "green")]}`}>{tgaStatusLabel(a.status)}</span>
              {a.prioritas === "urgent" && <span className={s.urgent}>URGENT</span>}
            </div>
          </div>
        </div>
        <dl className={s.dl}>
          <div><dt>Tanggal</dt><dd>{fmtDay(a.tanggal, today)}</dd></div>
          <div><dt>Jam</dt><dd>{a.jam_mulai ? `${a.jam_mulai}${a.jam_selesai ? ` – ${a.jam_selesai}` : ""}` : "—"}</dd></div>
          <div><dt>Lokasi</dt><dd>{a.lokasi || "—"}</dd></div>
          <div><dt>Requestor</dt><dd>{a.request_by || "—"}{a.departemen ? <small> · {a.departemen}</small> : null}</dd></div>
          {a.catatan && <div className={s.dlWide}><dt>Catatan</dt><dd>{a.catatan}</dd></div>}
        </dl>
        <div className={s.sheetActions}>
          {a.status !== "selesai" && <button type="button" className={s.primaryBtn} onClick={onDone}>✓ Tandai selesai</button>}
          <div className={s.btnRow}>
            <button type="button" className={s.ghostBtn} onClick={onEdit}>✎ Ubah</button>
            <button type="button" className={`${s.ghostBtn} ${s.danger}`} onClick={onDelete}>🗑 Hapus</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════ FORM ════════════ */
function FormSheet({ id, initial, today, recentLokasi, requestors, onClose, onSave, onSessionLost }: {
  id: string | null; initial: TgaDraft; today: string; recentLokasi: string[]; requestors: TgaRequestor[];
  onClose: () => void; onSave: (d: TgaDraft) => Promise<void>; onSessionLost: () => void;
}) {
  const [d, setD] = useState<TgaDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [more, setMore] = useState(Boolean(initial.catatan));
  const actRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof TgaDraft>(k: K, v: TgaDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const cat = TGA_CATEGORIES.find((c) => c.id === d.kategori);

  const reqMatches = useMemo(() => {
    const q = d.request_by.trim().toLowerCase();
    if (!q) return [];
    return requestors.filter((r) => r.nama.toLowerCase().includes(q) && r.nama.toLowerCase() !== q).slice(0, 6);
  }, [d.request_by, requestors]);

  async function submit() {
    if (!d.activity.trim()) { setErr("Isi dulu kegiatan yang dikerjakan."); actRef.current?.focus(); return; }
    if (d.jam_mulai && d.jam_selesai && d.jam_selesai < d.jam_mulai) { setErr("Jam selesai lebih awal dari jam mulai."); return; }
    setBusy(true); setErr(null);
    try {
      await onSave({ ...d, kategori: d.kategori || "Lainnya", jam_selesai: d.status === "selesai" && !d.jam_selesai && d.tanggal === today ? nowHM() : d.jam_selesai });
    } catch (e) {
      if (isSessionError(e)) { onSessionLost(); return; }
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className={s.formWrap}>
      <header className={s.formHead}>
        <button type="button" className={s.iconBtnDark} onClick={onClose} aria-label="Tutup">✕</button>
        <div><b>{id ? "Ubah kegiatan" : "Catat kegiatan"}</b><small>{id ? "Perbarui data pekerjaan" : "Isi singkat saja — 30 detik selesai"}</small></div>
      </header>

      <div className={s.formBody}>
        <section className={s.fSec}>
          <label className={s.fLabel}><span className={s.step}>1</span> Jenis pekerjaan</label>
          <div className={s.catGrid}>
            {TGA_CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={`${s.catBtn} ${d.kategori === c.id ? s.catOn : ""}`} style={{ ["--h" as string]: c.hue }} onClick={() => set("kategori", d.kategori === c.id ? "" : c.id)}>
                <span>{c.icon}</span><b>{c.id}</b>
              </button>
            ))}
          </div>
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel} htmlFor="tga-act"><span className={s.step}>2</span> Apa yang dikerjakan? <em>*</em></label>
          {cat && (
            <div className={s.quick}>
              {cat.quick.map((q) => <button key={q} type="button" onClick={() => { set("activity", d.activity && !d.activity.startsWith(q) ? `${q} — ${d.activity}` : q); actRef.current?.focus(); }}>{q}</button>)}
            </div>
          )}
          <textarea id="tga-act" ref={actRef} className={s.textarea} rows={3} placeholder="mis. Ganti lampu TL 2 buah di ruang meeting lt. 2" value={d.activity} onChange={(e) => set("activity", e.target.value)} />
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel} htmlFor="tga-lok"><span className={s.step}>3</span> Lokasi</label>
          <input id="tga-lok" className={s.input} placeholder="mis. Lobby, Gedung A lt. 2, Pos Security" value={d.lokasi} onChange={(e) => set("lokasi", e.target.value)} />
          {recentLokasi.length > 0 && (
            <div className={s.quick}>{recentLokasi.map((l) => <button key={l} type="button" className={d.lokasi === l ? s.quickOn : ""} onClick={() => set("lokasi", l)}>📍 {l}</button>)}</div>
          )}
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel} htmlFor="tga-req"><span className={s.step}>4</span> Requestor</label>
          <div className={s.twoCol}>
            <div className={s.acWrap}>
              <input id="tga-req" className={s.input} placeholder="Nama peminta" autoComplete="off" value={d.request_by}
                onChange={(e) => { set("request_by", e.target.value); setReqOpen(true); }} onFocus={() => setReqOpen(true)} onBlur={() => setTimeout(() => setReqOpen(false), 150)} />
              {reqOpen && reqMatches.length > 0 && (
                <ul className={s.acList}>
                  {reqMatches.map((r) => (
                    <li key={r.nama}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setD((x) => ({ ...x, request_by: r.nama, departemen: r.dept || x.departemen })); setReqOpen(false); }}>
                      <span className={s.avatarSm} style={{ ["--h" as string]: hueOf(r.nama) }}>{initials(r.nama)}</span>
                      <b>{r.nama}</b>{r.dept && <small>{r.dept}</small>}
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
            <input className={s.input} placeholder="Departemen" value={d.departemen} onChange={(e) => set("departemen", e.target.value)} />
          </div>
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel}><span className={s.step}>5</span> Status</label>
          <div className={s.statusSeg}>
            {TGA_STATUS.map((x) => (
              <button key={x.id} type="button" className={`${d.status === x.id ? s.segOn : ""} ${s["seg_" + x.tone]}`} onClick={() => set("status", x.id)}>
                <i />{x.short}
              </button>
            ))}
          </div>
          <button type="button" className={`${s.urgentToggle} ${d.prioritas === "urgent" ? s.urgentOn : ""}`} onClick={() => set("prioritas", d.prioritas === "urgent" ? "normal" : "urgent")} aria-pressed={d.prioritas === "urgent"}>
            <span className={s.switch}><span /></span>
            <span><b>Urgent</b><small>Tandai bila pekerjaan mendesak</small></span>
            <span className={s.flame}>🔥</span>
          </button>
        </section>

        <section className={s.fSec}>
          <label className={s.fLabel}><span className={s.step}>6</span> Waktu</label>
          <div className={s.timeGrid}>
            <label><small>Tanggal</small><input type="date" className={s.input} value={d.tanggal} max={today} onChange={(e) => set("tanggal", e.target.value || today)} /></label>
            <label><small>Mulai</small><input type="time" className={s.input} value={d.jam_mulai} onChange={(e) => set("jam_mulai", e.target.value)} /></label>
            <label><small>Selesai</small>
              <span className={s.timeWithBtn}>
                <input type="time" className={s.input} value={d.jam_selesai} onChange={(e) => set("jam_selesai", e.target.value)} />
                {!d.jam_selesai && <button type="button" onClick={() => set("jam_selesai", nowHM())}>Kini</button>}
              </span>
            </label>
          </div>
        </section>

        <section className={s.fSec}>
          {more ? (
            <>
              <label className={s.fLabel} htmlFor="tga-cat">Catatan <span className={s.opt}>opsional</span></label>
              <textarea id="tga-cat" className={s.textarea} rows={2} placeholder="Part yang dibutuhkan, kendala, tindak lanjut…" value={d.catatan} onChange={(e) => set("catatan", e.target.value)} />
            </>
          ) : <button type="button" className={s.addNote} onClick={() => setMore(true)}>＋ Tambah catatan</button>}
        </section>
      </div>

      <footer className={s.formFoot}>
        {err && <div className={s.errBox}>{err}</div>}
        <button type="button" className={s.saveBtn} onClick={submit} disabled={busy}>
          {busy ? "Menyimpan…" : id ? "Simpan perubahan" : "Simpan kegiatan"}
        </button>
      </footer>
    </div>
  );
}

/* ════════════ SUKSES ════════════ */
function Success({ a, isNew, onClose, onAnother }: { a: TgaActivity; isNew: boolean; onClose: () => void; onAnother: () => void }) {
  const c = tgaCategory(a.kategori);
  return (
    <div className={s.successWrap}>
      <div className={s.confetti}>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      <div className={s.successCard}>
        <div className={s.check}><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg></div>
        <h2>{isNew ? "Tercatat!" : "Tersimpan!"}</h2>
        <p>{isNew ? "Kegiatan masuk ke laporan GA." : "Perubahan sudah disimpan."}</p>
        <div className={s.ticket}>
          <div className={s.ticketTop}><span>{c.icon} {c.id}</span><b>{a.ref_no}</b></div>
          <strong>{a.activity}</strong>
          <div className={s.ticketMeta}>
            {a.lokasi && <span>📍 {a.lokasi}</span>}
            {a.request_by && <span>👤 {a.request_by}</span>}
            <span className={`${s.pill} ${s["t_" + (TGA_STATUS.find((x) => x.id === a.status)?.tone ?? "green")]}`}>{tgaStatusLabel(a.status)}</span>
          </div>
        </div>
        <button type="button" className={s.primaryBtn} onClick={onAnother}>＋ Catat lagi</button>
        <button type="button" className={s.ghostBtn} onClick={onClose}>Kembali ke beranda</button>
      </div>
    </div>
  );
}

function NavBtn({ on, icon, label, badge, onClick }: { on: boolean; icon: string; label: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={`${s.navBtn} ${on ? s.navOn : ""}`} onClick={onClick}>
      <span>{icon}{badge ? <em className={s.navBadge}>{badge > 99 ? "99+" : badge}</em> : null}</span><small>{label}</small>
    </button>
  );
}

function Skeleton() {
  return <div className={s.stack}><div className={`${s.skel} ${s.skelBig}`} /><div className={s.skel} /><div className={s.skel} /><div className={s.skel} /></div>;
}

function ToolGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
