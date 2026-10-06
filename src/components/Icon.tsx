import type { CSSProperties, ReactNode } from "react";

/**
 * Ikon garis (stroke) bergaya seragam untuk seluruh navigasi & kartu modul.
 * Menggantikan emoji supaya tampilan konsisten di semua OS dan mengikuti
 * warna teks (currentColor), jadi otomatis ikut light/dark.
 */
const P: Record<string, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  overview: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  tasks: <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9" /></>,
  vehicles: <><path d="M3 16V8a2 2 0 0 1 2-2h9l5 5v5" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /><path d="M3 16h2M10 16h4M19 16h2" /></>,
  gasstations: <><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M5 21h10M8 8h4" /><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0v-7l-3-3" /></>,
  claims: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  overtime: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 3h6" /></>,
  driverbudget: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  opfund: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.8-2.5 1.9 0 2.7 5 1.3 5 4 0 1.1-1.1 2-2.5 2-1.2 0-2.1-.5-2.7-1.4M12 6.5V8m0 8v1.5" /></>,
  canteen: <><path d="M4 11h16a8 8 0 0 1-16 0z" /><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3" /></>,
  locker: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 3v18M8.5 12h.01M15.5 12h.01" /></>,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1.5" /><path d="M5 13v8h14v-8M12 8v13" /><path d="M12 8c-2-4-6-3-5 0M12 8c2-4 6-3 5 0" /></>,
  printer: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  employeerequests: <><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
  atk: <><path d="M4 20l1-4L17 4a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14 7l3 3" /></>,
  reports: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
  masterdata: <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  activitylog: <><path d="M8 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V6" /><path d="M6 8H3m3 4H3m3 4H3M11 9h5M11 13h5" /></>,
  fleet: <><path d="M3 16V8a2 2 0 0 1 2-2h9l5 5v5" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /></>,
  finance: <><rect x="3" y="6" width="18" height="13" rx="2" /><circle cx="12" cy="12.5" r="2.5" /></>,
  facility: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-8h6v8" /></>,
  system: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  back: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M18 9a4 4 0 0 1 0 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  tv: <><rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M8 21h8M12 17v4" /><path d="M9.5 10.5l3-2v4z" /></>,
  expand: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  shrink: <><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  gate: <><path d="M3 21V8l9-5 9 5v13" /><path d="M3 12h18M8 21v-9M16 21v-9" /></>,
};

export type IconName = keyof typeof P;

export function hasIcon(name: string): name is IconName {
  return name in P;
}

export default function Icon({
  name,
  size = 19,
  strokeWidth = 1.8,
  style,
  className,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const body = P[name] ?? P.overview;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, ...style }}
      className={className}
    >
      {body}
    </svg>
  );
}
