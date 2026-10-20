"use client";

/* Sidebar dua kolom: rail ikon (grup menu) + panel isi grup.
   Hanya grup yang dipilih yang ditampilkan menunya, supaya sidebar lega. */

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import s from "./sidenav.module.css";

export interface SideNavItem { id: string; label: string; desc?: string }
export interface SideNavGroup { id: string; icon: string; label: string; short: string; items: SideNavItem[] }

const COLLAPSE_KEY = "cikops_nav_collapsed";

export default function SideNav({
  groups, activeTab, onSelect, lang, appName, live, userName, userRole, onSignOut, publicHref, isMobile, open, onClose,
}: {
  groups: SideNavGroup[];
  activeTab: string;
  onSelect: (tab: string) => void;
  lang: "id" | "en";
  appName: string;
  live: boolean;
  userName: string;
  userRole: string;
  onSignOut: () => void;
  publicHref?: string;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const groupOf = (tab: string) => groups.find((g) => g.items.some((i) => i.id === tab))?.id ?? groups[0]?.id ?? "";
  const [groupId, setGroupId] = useState(() => groupOf(activeTab));
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Grup di rail mengikuti menu yang sedang dibuka
  useEffect(() => { setGroupId(groupOf(activeTab)); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* privat */ } }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  function setCollapse(v: boolean) {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* privat */ }
  }
  const showPanel = isMobile || !collapsed;
  const group = groups.find((g) => g.id === groupId) ?? groups[0];

  function pickGroup(g: SideNavGroup) {
    setGroupId(g.id);
    if (g.items.length === 1) { onSelect(g.items[0].id); if (isMobile) onClose(); return; }
    if (collapsed && !isMobile) setCollapse(false);
  }

  const initials = (userName || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const userMenu = menu && (
    <div className={s.menu} role="menu">
      <div className={s.menuHead}><b>{userName}</b><small>{userRole}</small></div>
      {!isMobile && (
        <button type="button" role="menuitem" onClick={() => { setCollapse(!collapsed); setMenu(false); }}>
          <Icon name={collapsed ? "expand" : "shrink"} size={16} />{collapsed ? L("Tampilkan panel menu", "Show menu panel") : L("Ringkas sidebar", "Compact sidebar")}
        </button>
      )}
      <button type="button" role="menuitem" className={s.menuDanger} onClick={() => { setMenu(false); onSignOut(); }}>
        <Icon name="logout" size={16} />{L("Keluar", "Sign out")}
      </button>
    </div>
  );

  return (
    <>
      {isMobile && open && <div className={s.backdrop} onClick={onClose} />}
      <aside className={`${s.side} ${isMobile ? s.mobile : ""} ${isMobile && open ? s.open : ""}`} aria-label={L("Navigasi utama", "Main navigation")}>
        <div className={s.rail}>
          <div className={s.logo} title={appName}>
            <img src="/logo.png" alt="CIKOPS" />
          </div>
          <nav className={s.railNav}>
            {groups.map((g) => {
              const on = g.id === group?.id;
              const hasActive = g.items.some((i) => i.id === activeTab);
              return (
                <button key={g.id} type="button" className={`${s.railBtn} ${on ? s.railOn : ""} ${hasActive && !on ? s.railHas : ""}`}
                  onClick={() => pickGroup(g)} aria-pressed={on} title={g.label}>
                  <Icon name={g.icon} size={21} />
                  <span>{g.short}</span>
                </button>
              );
            })}
          </nav>
          <div className={s.railFoot} ref={showPanel ? undefined : menuRef}>
            <button type="button" className={s.railAvatar} onClick={() => setMenu((m) => !m)} aria-label={L("Menu akun", "Account menu")} title={userName}>
              {initials}<i className={live ? s.dotLive : s.dotOff} />
            </button>
            {!showPanel && userMenu}
          </div>
        </div>

        {showPanel && group && (
          <div className={s.panel}>
            <div className={s.brand}>
              <div>
                <b>{appName}</b>
                <i className={live ? s.dotLive : s.dotOff} title={live ? "LIVE" : L("Menyambungkan…", "Connecting…")} />
              </div>
              <small>{live ? L("Operational workspace · live", "Operational workspace · live") : L("Menyambungkan…", "Connecting…")}</small>
              {isMobile ? (
                <button type="button" className={s.panelBtn} onClick={onClose} aria-label={L("Tutup menu", "Close menu")}>✕</button>
              ) : (
                <button type="button" className={s.panelBtn} onClick={() => setCollapse(true)} aria-label={L("Sembunyikan panel menu", "Hide menu panel")} title={L("Sembunyikan panel", "Hide panel")}>
                  <Icon name="back" size={16} />
                </button>
              )}
            </div>

            <div className={s.groupHead}>
              <h3>{group.label}</h3>
              <span>{group.items.length}</span>
            </div>
            <nav className={s.items}>
              {group.items.map((it) => (
                <button key={it.id} type="button" className={`${s.item} ${activeTab === it.id ? s.itemOn : ""}`}
                  onClick={() => { onSelect(it.id); if (isMobile) onClose(); }} aria-current={activeTab === it.id ? "page" : undefined} title={it.desc}>
                  <span className={s.itemIc}><Icon name={it.id} size={18} /></span>
                  <span className={s.itemText}>{it.label}</span>
                </button>
              ))}
            </nav>

            <div className={s.panelFoot}>
              {publicHref && (
                <a className={s.publicLink} href={publicHref} target="_blank" rel="noopener noreferrer" title={L("Dashboard-ViewOnly · tanpa login", "Dashboard-ViewOnly · no login")}>
                  <Icon name="external" size={16} />
                  <span>{L("Tampilan publik", "Public view")}</span>
                  <em>↗</em>
                </a>
              )}
              <div className={s.userWrap} ref={menuRef}>
                <button type="button" className={s.user} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
                  <span className={s.userAv}>{initials}</span>
                  <span className={s.userText}><b>{userName}</b><small>{userRole}</small></span>
                  <span className={s.chev}>›</span>
                </button>
                {userMenu}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
