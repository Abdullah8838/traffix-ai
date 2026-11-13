import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { EDGES, NODES, NODE_MAP } from "@/lib/traffic/graph";
import { PALETTE, congestionColor } from "@/lib/palette";
import type { TrafficMapProps } from "./types";

const CENTER: [number, number] = [12.955, 77.645];

function ClickHandler({ onMapClick }: { onMapClick?: TrafficMapProps["onMapClick"] }) {
  useMapEvents({
    click(e) {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function Fit({ fitTo, focus }: Pick<TrafficMapProps, "fitTo" | "focus">) {
  const map = useMap();
  const key = fitTo?.join(",");
  useEffect(() => {
    const ids = fitTo && fitTo.length > 1 ? fitTo : NODES.map((n) => n.id);
    const pts = ids.map((n) => [NODE_MAP[n].lat, NODE_MAP[n].lng] as [number, number]);
    // Wait a tick so the lazily mounted container has its final size.
    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(pts, { padding: [36, 36], maxZoom: 14 });
    }, 80);
    return () => clearTimeout(t);
  }, [key, map]);
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? 14, { duration: 0.8 });
  }, [focus, map]);
  return null;
}

export default function TrafficMapImpl({
  congestion,
  closedEdges,
  routes = [],
  markers = [],
  showNodes = true,
  showEdges = true,
  selected,
  highlightNodes = [],
  onNodeClick,
  onEdgeClick,
  onMapClick,
  fitTo,
  focus,
  className,
  zoom = 12,
}: TrafficMapProps) {
  const [tilesDown, setTilesDown] = useState(false);
  const highlight = useMemo(() => new Set(highlightNodes), [highlightNodes]);

  return (
    <div className={`relative isolate overflow-hidden rounded-xl border ${className ?? "h-[420px]"}`}>
      <MapContainer center={CENTER} zoom={zoom} className="h-full w-full" scrollWheelZoom zoomControl>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
          className="osm-dark-tiles"
          eventHandlers={{ tileerror: () => setTilesDown(true) }}
        />
        <ClickHandler onMapClick={onMapClick} />
        <Fit fitTo={fitTo} focus={focus} />

        {showEdges &&
          EDGES.map((e) => {
            const a = NODE_MAP[e.from], b = NODE_MAP[e.to];
            const closed = closedEdges?.has(e.id);
            const c = congestion?.[e.id] ?? 0.3;
            return (
              <Polyline
                key={e.id}
                positions={[[a.lat, a.lng], [b.lat, b.lng]]}
                pathOptions={{
                  color: closed ? PALETTE.red : congestion ? congestionColor(c) : PALETTE.slate,
                  weight: closed ? 4 : 2 + e.lanes * 0.6,
                  opacity: closed ? 0.95 : 0.75,
                  dashArray: closed ? "6 8" : undefined,
                }}
                eventHandlers={onEdgeClick ? { click: () => onEdgeClick(e.id) } : undefined}
              >
                <Tooltip sticky>
                  <div className="text-xs">
                    <div className="font-semibold">{e.name}</div>
                    {closed ? (
                      <div>Road closed</div>
                    ) : congestion ? (
                      <div>Congestion {Math.round(c * 100)}% (simulated)</div>
                    ) : null}
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

        {routes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.nodes.map((n) => [NODE_MAP[n].lat, NODE_MAP[n].lng] as [number, number])}
            pathOptions={{ color: r.color, weight: r.weight ?? 7, opacity: r.opacity ?? 0.95, dashArray: r.dashed ? "10 10" : undefined, lineCap: "round" }}
            eventHandlers={r.onClick ? { click: r.onClick } : undefined}
          >
            {r.label && <Tooltip sticky>{r.label}</Tooltip>}
          </Polyline>
        ))}

        {showNodes &&
          NODES.map((n) => {
            const isSrc = selected?.source === n.id;
            const isDst = selected?.destination === n.id;
            const hl = highlight.has(n.id);
            return (
              <CircleMarker
                key={n.id}
                center={[n.lat, n.lng]}
                radius={isSrc || isDst ? 9 : hl ? 7 : 5}
                pathOptions={{
                  color: isSrc ? PALETTE.green : isDst ? PALETTE.red : hl ? PALETTE.cyan : PALETTE.text,
                  fillColor: isSrc ? PALETTE.green : isDst ? PALETTE.red : hl ? PALETTE.cyan : PALETTE.navy,
                  fillOpacity: 1,
                  weight: 2,
                }}
                eventHandlers={onNodeClick ? { click: () => onNodeClick(n.id) } : undefined}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <span className="text-xs font-semibold">
                    {n.name}
                    {isSrc ? " · Source" : isDst ? " · Destination" : ""}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })}

        {markers.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={m.radius ?? 8}
            pathOptions={{ color: m.color, fillColor: m.color, fillOpacity: 0.55, weight: 2 }}
            eventHandlers={m.onClick ? { click: m.onClick } : undefined}
          >
            <Tooltip direction="top">
              <div className="text-xs">
                <div className="font-semibold">{m.label}</div>
                {m.detail && <div className="opacity-80">{m.detail}</div>}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      {tilesDown && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md glass-strong px-2 py-1 text-[11px] text-muted-foreground">
          Map tiles unavailable — showing the road graph only
        </div>
      )}
    </div>
  );
}
