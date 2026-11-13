import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { TrafficMapProps } from "./types";

const Impl = lazy(() => import("./TrafficMapImpl"));

function MapSkeleton({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl border bg-ink grid-lines ${className ?? "h-[420px]"}`}>
      <span className="text-xs text-muted-foreground">Loading map…</span>
    </div>
  );
}

export function TrafficMap(props: TrafficMapProps) {
  return (
    <ClientOnly fallback={<MapSkeleton className={props.className} />}>
      <Suspense fallback={<MapSkeleton className={props.className} />}>
        <Impl {...props} />
      </Suspense>
    </ClientOnly>
  );
}
export type { MapMarker, MapRoute, TrafficMapProps } from "./types";
