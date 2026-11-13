import { lazy, Suspense, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { CitySceneProps } from "./CitySceneImpl";
import { CityFallback2D } from "./CityFallback2D";

const Impl = lazy(() => import("./CitySceneImpl"));

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Inner(props: CitySceneProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(hasWebGL()), []);
  if (ok === null) return <div className={props.className ?? "h-full w-full"} />;
  if (!ok) return <CityFallback2D {...props} />;
  return (
    <Suspense fallback={<div className={props.className ?? "h-full w-full"} />}>
      <Impl {...props} />
    </Suspense>
  );
}

export function CityScene(props: CitySceneProps) {
  return (
    <ClientOnly fallback={<div className={props.className ?? "h-full w-full"} />}>
      <Inner {...props} />
    </ClientOnly>
  );
}
export type { CitySceneProps };
