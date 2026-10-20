"use client";
import { useRef, useState } from "react";
import { useApp } from "@/components/AppContext";
import { Count, Loading } from "@/components/ui";
import { ExtraSections } from "@/components/ExtraSections";
import { dec, fmt } from "@/lib/constants";
import { incTotal, monthName, patrolPct } from "@/lib/calc";
import { api, debounced } from "@/lib/data";
import { useDrafts } from "@/lib/useDrafts";
import type { Patrol } from "@/lib/types";

const PATROL_FIELDS: [keyof Patrol, string][] = [
  ["target_patrol", "Target patroli"], ["actual_patrol", "Patroli terlaksana"],
  ["target_checkpoint", "Target checkpoint"], ["actual_checkpoint", "Checkpoint ter-scan"],
];

export default function Kejadian() {
  const { D, setD, error, siteId, canWrite, toast, fail } = useApp();
  const { set, clear, val } = useDrafts();
  const [bumped, setBumped] = useState<{ c: string; n: number } | null>(null);
  const Dref = useRef(D);
  Dref.current = D;
  if (!D) return <Loading error={error} />;
  const { prevName } = monthName(D.month);

  function patchInc(cat: string, patch: { value?: number; note?: string }, delay = 0) {
    if (!siteId || !D) return;
    const cur = D.inc.find((i) => i.category === cat)!;
    const next = { ...cur, ...patch };
    setD((p) => p && { ...p, inc: p.inc.map((i) => (i.category === cat ? next : i)) });
    const month = D.month;
    const latest = () => Dref.current?.inc.find((i) => i.category === cat) ?? next;
    if (delay) debounced(`inc:${cat}:${Object.keys(patch)[0]}`, async () => { await api.setIncident(siteId, month, cat, {}, latest()); if (patch.note !== undefined) clear(`note:${cat}`); }, delay, fail);
    else api.setIncident(siteId, month, cat, {}, next).catch(fail);
  }
  function stepInc(cat: string, dl: number) {
    const cur = D!.inc.find((i) => i.category === cat)!;
    const v = Math.max(0, cur.value + dl);
    patchInc(cat, { value: v });
    setBumped({ c: cat, n: Date.now() });
    if (!cur.value && v) toast(`${cat} ditambahkan`);
  }
  function patchPatrol(k: keyof Patrol, raw: string) {
    if (!siteId || !D) return;
    const v = k === "note" ? raw : Math.max(0, parseInt(raw) || 0);
    set(`pat:${k}`, raw);
    const next = { ...D.patrol, [k]: v } as Patrol;
    setD((p) => p && { ...p, patrol: next });
    const month = D.month;
    debounced("patrol", async () => { await api.setPatrol(siteId, month, Dref.current?.patrol ?? next); clear(`pat:${k}`); }, 500, fail);
  }

  const on = D.inc.filter((i) => i.value > 0), off = D.inc.filter((i) => !(i.value > 0));
  const mx = Math.max(1, ...D.inc.map((i) => i.value)), pc = patrolPct(D);

  return (
    <div className="page enter">
      <section>
        <div className="eyebrow">Kejadian & patroli</div>
        <h1><Count value={incTotal(D)} /> kejadian bulan ini</h1>
        <p className="lede">Ubah jumlah dengan tombol − dan +. Keterangan cukup satu kalimat; kalimat ini yang masuk ke highlights laporan.</p>
        {!canWrite && <p className="readonly-note" style={{ marginTop: 14 }}>Akun ini hanya bisa melihat data.</p>}
      </section>

      <fieldset className="sec ro" disabled={!canWrite}>
        <ul className="rows inc">
          {on.map((i) => {
            const p = D.incPrev[i.category];
            return (
              <li key={i.category}>
                <div><b>{i.category}</b>{p !== null && p !== undefined && <div className="sub" style={{ margin: 0 }}>{prevName}: {p} · {i.value < p ? <span className="dn">turun {p - i.value}</span> : <span className="upc">naik {i.value - p}</span>}</div>}</div>
                <div className="step">
                  <button type="button" onClick={() => stepInc(i.category, -1)} aria-label="Kurangi">−</button>
                  <input key={bumped?.c === i.category ? bumped.n : 0} className={bumped?.c === i.category ? "bump" : ""} type="number" min={0} value={i.value} aria-label={`Jumlah ${i.category}`} onChange={(e) => patchInc(i.category, { value: Math.max(0, parseInt(e.target.value) || 0) }, 500)} />
                  <button type="button" onClick={() => stepInc(i.category, 1)} aria-label="Tambah">+</button>
                </div>
                <div className="prop"><i style={{ width: `${(i.value / mx) * 100}%` }}></i></div>
                <input className={`inline ket ${!val(`note:${i.category}`, i.note) ? "need" : ""}`} value={val(`note:${i.category}`, i.note)} placeholder="Tulis keterangan singkat" aria-label={`Keterangan ${i.category}`}
                  onChange={(e) => { set(`note:${i.category}`, e.target.value); patchInc(i.category, { note: e.target.value }, 600); }} />
              </li>
            );
          })}
        </ul>
        {off.length > 0 && (
          <div>
            <p className="sub" style={{ margin: "0 0 10px" }}>Tanpa kejadian bulan ini. Klik untuk menambah:</p>
            <div className="chips">{off.map((i) => <button type="button" key={i.category} onClick={() => stepInc(i.category, 1)}>+ {i.category}</button>)}</div>
          </div>
        )}
      </fieldset>

      <fieldset className="sec ro" disabled={!canWrite}>
        <div><h2>Patroli</h2><p className="sub">Salin dari rekap sistem guard tour.</p></div>
        <div className="split">
          <div className="pat">
            {PATROL_FIELDS.map(([k, l]) => (
              <div key={k}><label htmlFor={`p-${k}`}>{l}</label><input id={`p-${k}`} type="number" min={0} value={val(`pat:${k}`, D.patrol[k] as number)} onChange={(e) => patchPatrol(k, e.target.value)} /></div>
            ))}
          </div>
          <div>
            <div className="num" style={{ fontSize: 64 }}>{dec(pc)}<span style={{ fontSize: ".45em" }}>%</span></div>
            <div className="meter big"><i style={{ width: `${pc}%` }}></i></div>
            <div className="sub">{fmt(D.patrol.target_checkpoint - D.patrol.actual_checkpoint)} checkpoint terlewat</div>
            <label htmlFor="p-note" style={{ display: "block", fontSize: 13, fontWeight: 600, margin: "20px 0 6px" }}>Catatan untuk laporan</label>
            <textarea id="p-note" className="inline" value={val("pat:note", D.patrol.note)} onChange={(e) => patchPatrol("note", e.target.value)} />
          </div>
        </div>
      </fieldset>

      <ExtraSections />
    </div>
  );
}
