"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GasStation } from "@/lib/types";
import { BRAND } from "@/lib/brand";

// Custom gold pin icon (Sky & Gold theme) built as a DivIcon so it doesn't
// depend on Leaflet's default marker image assets (which don't resolve
// correctly under Next.js's bundler without extra config).
function goldPinIcon(active = false) {
  const fill = active
    ? getComputedStyle(document.documentElement).getPropertyValue("--gold2").trim() || "#0f9c8f"
    : getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() || "#17c3b2";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      background:${fill};
      border:2px solid #ffffff;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    "><div style="width:8px;height:8px;border-radius:50%;background:#fff;transform:rotate(45deg)"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

function ClickHandler({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Forces Leaflet to recompute its size after the container becomes visible
 *  (e.g. after switching tabs) — otherwise the map can render at 0 height. */
function InvalidateSizeOnMount() {
  const map = useMapEvents({});
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}

/** Pans/zooms the map to a station when it's selected from the list
 *  sidebar, and opens its popup — so clicking a list item visibly jumps
 *  the map to that point instead of leaving the user to hunt for it. */
function FlyToStation({
  station,
  markerRefs,
}: {
  station: GasStation | null;
  markerRefs: React.MutableRefObject<Record<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!station) return;
    map.flyTo([station.lat, station.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    const marker = markerRefs.current[station.id];
    // Small delay so the popup opens once the fly animation has settled
    // enough for Leaflet to position it correctly.
    const id = setTimeout(() => marker?.openPopup(), 350);
    return () => clearTimeout(id);
  }, [station, map, markerRefs]);
  return null;
}

const DEFAULT_CENTER: [number, number] = BRAND.mapCenter;

export default function GasStationMap({
  stations,
  placing,
  onPick,
  onMarkerClick,
  focusStation,
}: {
  stations: GasStation[];
  placing: boolean;
  onPick: (lat: number, lng: number) => void;
  onMarkerClick: (station: GasStation) => void;
  focusStation?: GasStation | null;
}) {
  const markerRefs = useRef<Record<string, L.Marker>>({});

  return (
    <div style={{ height: 420, borderRadius: "var(--r2)", overflow: "hidden", border: "1px solid var(--border)", cursor: placing ? "crosshair" : "", position: "relative", zIndex: 0 }}>
      <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler enabled={placing} onPick={onPick} />
        <InvalidateSizeOnMount />
        <FlyToStation station={focusStation ?? null} markerRefs={markerRefs} />
        {stations.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={goldPinIcon()}
            ref={(m) => {
              if (m) markerRefs.current[s.id] = m;
            }}
            eventHandlers={{
              click: () => onMarkerClick(s),
              // Hover shows the detail popup immediately, no click needed —
              // mouseout closes it again so the map doesn't get cluttered.
              mouseover: (e) => e.target.openPopup(),
              mouseout: (e) => e.target.closePopup(),
            }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{s.name}</div>
                {s.address && <div style={{ fontSize: 12, color: "#57708f", marginBottom: 6 }}>{s.address}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {s.fuels.filter((f) => f.available).map((f) => (
                    <span key={f.type} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#eaf1fd", color: "#3d6ff2" }}>
                      {f.type}
                    </span>
                  ))}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
