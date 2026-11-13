import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { NODES, NODE_MAP, type NodeId } from "@/lib/traffic/graph";
import {
  EDGE_GEOM,
  NODE_XZ,
  addAmbulance,
  createWorld,
  lightAt,
  project,
  stepWorld,
  vehiclePose,
  type CityWorld,
} from "@/lib/traffic/citySim";
import { PALETTE, congestionColor } from "@/lib/palette";

export interface CitySceneProps {
  mode: "showcase" | "twin";
  congestion: Record<string, number>;
  closed: Set<string>;
  incidents: { id: string; lat: number; lng: number; severity: number }[];
  signalsOptimized: boolean;
  running?: boolean;
  resetKey?: number;
  vehicleCount?: number;
  selectedEdge?: string | null;
  selectedNode?: NodeId | null;
  onSelectEdge?: (id: string) => void;
  onSelectNode?: (id: NodeId) => void;
  ambulanceRoute?: NodeId[] | null;
  ambulanceKey?: number;
  worldRef?: MutableRefObject<CityWorld | null>;
  className?: string;
}

const CAR_COLORS = ["#E6EDF7", "#9AA7B8", "#F59E0B", "#3B82F6", "#EF4444", "#22C55E"].map((c) => new THREE.Color(c));
const MAX_CARS = 400;
const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToRoads(x: number, z: number) {
  let best = Infinity;
  for (const g of EDGE_GEOM) {
    const px = x - g.a[0], pz = z - g.a[1];
    const t = Math.max(0, Math.min(g.len, px * g.ux + pz * g.uz));
    best = Math.min(best, Math.hypot(px - g.ux * t, pz - g.uz * t));
  }
  return best;
}

function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1a2436";
  ctx.fillRect(0, 0, 64, 128);
  const r = seeded(42);
  for (let y = 4; y < 124; y += 8)
    for (let x = 4; x < 60; x += 8) {
      const v = r();
      ctx.fillStyle = v > 0.82 ? "#f6c46a" : v > 0.7 ? "#7dd3fc" : "#243149";
      ctx.fillRect(x, y, 4, 4);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b1422";
  ctx.fillRect(0, 0, 512, 512);
  const r = seeded(9);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() > 0.5 ? "rgba(30,48,74,0.35)" : "rgba(10,18,30,0.5)";
    ctx.fillRect(r() * 512, r() * 512, 2 + r() * 6, 2 + r() * 6);
  }
  ctx.strokeStyle = "rgba(6,182,212,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Buildings() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tex = useMemo(windowTexture, []);
  const items = useMemo(() => {
    const r = seeded(1234);
    const out: { x: number; z: number; w: number; d: number; h: number; tint: number }[] = [];
    const counts = { tech: 26, commercial: 30, residential: 22, junction: 10 } as const;
    const heights = { tech: [2, 7.5], commercial: [1.4, 5], residential: [0.5, 1.8], junction: [0.6, 2.4] } as const;
    for (const n of NODES) {
      const [cx, cz] = NODE_XZ[n.id];
      for (let k = 0, tries = 0; k < counts[n.kind] && tries < 200; tries++) {
        const a = r() * Math.PI * 2, rad = 1.6 + r() * 4.5;
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        const w = 0.45 + r() * 0.9, d = 0.45 + r() * 0.9;
        if (distToRoads(x, z) < 0.85 + Math.max(w, d) / 2) continue;
        const [lo, hi] = heights[n.kind];
        out.push({ x, z, w, d, h: lo + (hi - lo) * r() ** 1.6, tint: r() });
        k++;
      }
    }
    for (const g of EDGE_GEOM) {
      for (let t = 1.5; t < g.len - 1.5; t += 1.6) {
        for (const side of [-1, 1]) {
          if (r() < 0.35) continue;
          const off = side * (1.2 + r() * 1.1);
          const x = g.a[0] + g.ux * t + g.uz * off, z = g.a[1] + g.uz * t - g.ux * off;
          const w = 0.4 + r() * 0.6, d = 0.4 + r() * 0.6;
          if (distToRoads(x, z) < 0.8 + Math.max(w, d) / 2) continue;
          out.push({ x, z, w, d, h: 0.35 + r() * 1.4, tint: r() });
        }
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = ref.current!;
    items.forEach((b, i) => {
      tmp.position.set(b.x, b.h / 2, b.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(b.w, b.h, b.d);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      tmpColor.set(b.tint > 0.85 ? "#9fb6d9" : b.tint > 0.5 ? "#c9d3e3" : "#7f8fa8");
      m.setColorAt(i, tmpColor);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.55} metalness={0.25} />
    </instancedMesh>
  );
}

function Roads({ congestion, closed, selectedEdge, onSelectEdge }: Pick<CitySceneProps, "congestion" | "closed" | "selectedEdge" | "onSelectEdge">) {
  const base = useRef<THREE.InstancedMesh>(null);
  const line = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    EDGE_GEOM.forEach((g, i) => {
      const mx = (g.a[0] + g.b[0]) / 2, mz = (g.a[1] + g.b[1]) / 2;
      const w = 0.55 + g.edge.lanes * 0.1;
      tmp.position.set(mx, 0.03, mz);
      tmp.rotation.set(0, g.angle, 0);
      tmp.scale.set(w, 0.06, g.len);
      tmp.updateMatrix();
      base.current!.setMatrixAt(i, tmp.matrix);
      const sel = selectedEdge === g.edge.id;
      tmp.position.set(mx, 0.075, mz);
      tmp.scale.set(sel ? 0.38 : 0.14, 0.02, g.len - 0.6);
      tmp.updateMatrix();
      line.current!.setMatrixAt(i, tmp.matrix);
      tmpColor.set(sel ? PALETTE.cyan : closed.has(g.edge.id) ? PALETTE.red : congestionColor(congestion[g.edge.id] ?? 0.3));
      line.current!.setColorAt(i, tmpColor);
    });
    base.current!.instanceMatrix.needsUpdate = true;
    line.current!.instanceMatrix.needsUpdate = true;
    if (line.current!.instanceColor) line.current!.instanceColor.needsUpdate = true;
  }, [congestion, closed, selectedEdge]);

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!onSelectEdge || e.instanceId === undefined) return;
    e.stopPropagation();
    onSelectEdge(EDGE_GEOM[e.instanceId].edge.id);
  };
  return (
    <group>
      <instancedMesh ref={base} args={[undefined, undefined, EDGE_GEOM.length]} onClick={click}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1b2638" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={line} args={[undefined, undefined, EDGE_GEOM.length]} onClick={click}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Junctions({ selectedNode, onSelectNode }: Pick<CitySceneProps, "selectedNode" | "onSelectNode">) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const poles = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    NODES.forEach((n, i) => {
      const [x, z] = NODE_XZ[n.id];
      const sel = selectedNode === n.id;
      tmp.position.set(x, 0.05, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(sel ? 1.5 : 1.1, 0.1, sel ? 1.5 : 1.1);
      tmp.updateMatrix();
      ref.current!.setMatrixAt(i, tmp.matrix);
      tmpColor.set(sel ? PALETTE.cyan : "#243149");
      ref.current!.setColorAt(i, tmpColor);
      for (let k = 0; k < 2; k++) {
        tmp.position.set(x + (k ? 0 : 1.05), 0.6, z + (k ? 1.05 : 0));
        tmp.scale.set(0.05, 1.2, 0.05);
        tmp.updateMatrix();
        poles.current!.setMatrixAt(i * 2 + k, tmp.matrix);
      }
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    poles.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [selectedNode]);
  return (
    <group>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, NODES.length]}
        onClick={(e) => {
          if (!onSelectNode || e.instanceId === undefined) return;
          e.stopPropagation();
          onSelectNode(NODES[e.instanceId].id);
        }}
      >
        <cylinderGeometry args={[1, 1, 1, 24]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={poles} args={[undefined, undefined, NODES.length * 2]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color="#3a475c" />
      </instancedMesh>
    </group>
  );
}

function Hazards({ congestion, closed, incidents }: Pick<CitySceneProps, "congestion" | "closed" | "incidents">) {
  const zones = useRef<THREE.Group>(null);
  const beacons = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    zones.current?.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.14 + 0.1 * Math.sin(t * 2 + i);
    });
    beacons.current?.children.forEach((c, i) => {
      const s = 1 + 0.35 * Math.sin(t * 3 + i);
      c.children[1]?.scale.set(s, 1, s);
    });
  });
  const heavy = EDGE_GEOM.filter((g) => !closed.has(g.edge.id) && (congestion[g.edge.id] ?? 0) >= 0.7);
  const closedG = EDGE_GEOM.filter((g) => closed.has(g.edge.id));
  return (
    <group>
      <group ref={zones}>
        {heavy.map((g) => (
          <mesh key={g.edge.id} position={[(g.a[0] + g.b[0]) / 2, 0.3, (g.a[1] + g.b[1]) / 2]} rotation={[0, g.angle, 0]}>
            <boxGeometry args={[2.2, 0.6, g.len * 0.8]} />
            <meshBasicMaterial color={PALETTE.red} transparent opacity={0.18} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {closedG.map((g) => (
        <group key={g.edge.id} position={[(g.a[0] + g.b[0]) / 2, 0, (g.a[1] + g.b[1]) / 2]} rotation={[0, g.angle, 0]}>
          {[-0.3, 0.3].map((o) => (
            <mesh key={o} position={[0, 0.25, o]}>
              <boxGeometry args={[1.6, 0.22, 0.12]} />
              <meshStandardMaterial color={PALETTE.amber} emissive={PALETTE.amber} emissiveIntensity={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      <group ref={beacons}>
        {incidents.map((inc) => {
          const [x, z] = project(inc.lat, inc.lng);
          const col = inc.severity >= 4 ? PALETTE.red : PALETTE.amber;
          return (
            <group key={inc.id} position={[x, 0, z]}>
              <mesh position={[0, 1.4, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 2.8, 6]} />
                <meshBasicMaterial color={col} toneMapped={false} />
              </mesh>
              <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.5, 0.7, 24]} />
                <meshBasicMaterial color={col} transparent opacity={0.7} toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

function Sim(props: CitySceneProps & { onFirstFrame: () => void }) {
  const { congestion, closed, signalsOptimized, running = true, mode, vehicleCount = mode === "showcase" ? 170 : 220 } = props;
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const amb = useRef<THREE.Group>(null);
  const ambLight = useRef<THREE.MeshBasicMaterial>(null);
  const world = useRef<CityWorld | null>(null);
  const cond = useRef({ congestion, closed, signalsOptimized });
  cond.current = { congestion, closed, signalsOptimized };
  const first = useRef(false);

  useEffect(() => {
    world.current = createWorld(7, Math.min(MAX_CARS, vehicleCount), cond.current);
    if (props.worldRef) props.worldRef.current = world.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.resetKey, vehicleCount]);

  useEffect(() => {
    if (world.current && props.ambulanceRoute && props.ambulanceRoute.length > 1) addAmbulance(world.current, props.ambulanceRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ambulanceKey]);

  useLayoutEffect(() => {
    for (let i = 0; i < MAX_CARS; i++) {
      body.current!.setColorAt(i, CAR_COLORS[0]);
    }
    for (let i = 0; i < NODES.length * 2; i++) lamps.current!.setColorAt(i, tmpColor.set(PALETTE.green));
  }, []);

  useFrame(({ camera, clock }, delta) => {
    const w = world.current;
    if (!w) return;
    const dt = Math.min(delta, 0.05);
    if (running) stepWorld(w, dt * (mode === "showcase" ? 1.4 : 1), cond.current);

    let n = 0;
    let ambulanceVisible = false;
    for (const v of w.vehicles) {
      if (v.done) continue;
      const p = vehiclePose(v);
      if (v.kind === "ambulance") {
        ambulanceVisible = true;
        amb.current?.position.set(p.x, 0.12, p.z);
        amb.current?.rotation.set(0, p.angle, 0);
        continue;
      }
      if (n >= MAX_CARS) break;
      tmp.position.set(p.x, 0.16, p.z);
      tmp.rotation.set(0, p.angle, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      body.current!.setMatrixAt(n, tmp.matrix);
      tmp.position.y = 0.3;
      tmp.scale.set(0.8, 0.8, 0.55);
      tmp.updateMatrix();
      cabin.current!.setMatrixAt(n, tmp.matrix);
      body.current!.setColorAt(n, CAR_COLORS[v.color]);
      n++;
    }
    body.current!.count = n;
    cabin.current!.count = n;
    body.current!.instanceMatrix.needsUpdate = true;
    cabin.current!.instanceMatrix.needsUpdate = true;
    if (body.current!.instanceColor) body.current!.instanceColor.needsUpdate = true;
    if (amb.current) amb.current.visible = ambulanceVisible;
    if (ambLight.current) ambLight.current.color.set(Math.sin(clock.elapsedTime * 14) > 0 ? PALETTE.red : PALETTE.blue);

    NODES.forEach((node, i) => {
      const [x, z] = NODE_XZ[node.id];
      const sig = w.signals[node.id];
      for (let k = 0; k < 2; k++) {
        const axis = k ? "NS" : "EW";
        const l = lightAt(w, node.id, axis);
        tmp.position.set(x + (k ? 0 : 1.05), 1.25, z + (k ? 1.05 : 0));
        tmp.rotation.set(0, 0, 0);
        const s = sig.priority ? 0.26 : 0.18;
        tmp.scale.set(s, s, s);
        tmp.updateMatrix();
        lamps.current!.setMatrixAt(i * 2 + k, tmp.matrix);
        lamps.current!.setColorAt(i * 2 + k, tmpColor.set(l === "green" ? PALETTE.green : l === "yellow" ? PALETTE.amber : PALETTE.red));
      }
    });
    lamps.current!.instanceMatrix.needsUpdate = true;
    if (lamps.current!.instanceColor) lamps.current!.instanceColor.needsUpdate = true;

    if (mode === "showcase") {
      const t = clock.elapsedTime * 0.05;
      camera.position.set(Math.sin(t) * 46, 17 + Math.sin(t * 2) * 3, Math.cos(t) * 46);
      camera.lookAt(0, 3, 0);
    }
    if (!first.current) {
      first.current = true;
      props.onFirstFrame();
    }
  });

  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.22, 0.14, 0.42]} />
        <meshStandardMaterial roughness={0.4} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.22, 0.14, 0.42]} />
        <meshStandardMaterial color="#0f1a2b" roughness={0.2} metalness={0.6} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, NODES.length * 2]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <group ref={amb} visible={false}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.34, 0.26, 0.7]} />
          <meshStandardMaterial color="#f8fafc" emissive="#ffffff" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.36, 0.06, 0.72]} />
          <meshBasicMaterial color={PALETTE.red} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.3, 0.1]}>
          <boxGeometry args={[0.26, 0.07, 0.12]} />
          <meshBasicMaterial ref={ambLight} color={PALETTE.red} toneMapped={false} />
        </mesh>
        <pointLight color={PALETTE.red} intensity={6} distance={4} position={[0, 0.8, 0]} />
      </group>
    </group>
  );
}

function Labels({ selectedNode }: { selectedNode?: NodeId | null }) {
  return (
    <group>
      {NODES.filter((n) => n.kind !== "junction" || n.id === selectedNode || ["SB", "HEB", "KRP"].includes(n.id)).map((n) => {
        const [x, z] = NODE_XZ[n.id];
        return (
          <Html key={n.id} position={[x, 2.2, z]} center distanceFactor={60} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <div className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold glass-strong ${n.id === selectedNode ? "text-cyan" : "text-foreground"}`}>
              {NODE_MAP[n.id].name}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function DataRings() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    g.current?.children.forEach((c, i) => {
      c.rotation.z = clock.elapsedTime * (0.4 + i * 0.1);
      c.position.y = 6 + Math.sin(clock.elapsedTime + i) * 0.6;
    });
  });
  return (
    <group ref={g}>
      {(["SB", "MAR", "HEB", "MG", "WF", "EC"] as NodeId[]).map((id) => {
        const [x, z] = NODE_XZ[id];
        return (
          <mesh key={id} position={[x, 6, z]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.4, 0.04, 8, 48]} />
            <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.7} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function CitySceneImpl(props: CitySceneProps) {
  const ground = useMemo(groundTexture, []);
  const wrap = useRef<HTMLDivElement>(null);
  const twin = props.mode === "twin";
  return (
    <div ref={wrap} className={props.className ?? "h-full w-full"}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: twin ? [0, 55, 60] : [0, 30, 58], fov: 45, near: 0.5, far: 400 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => undefined}
      >
        <color attach="background" args={[PALETTE.navy]} />
        <fog attach="fog" args={[PALETTE.navy, twin ? 70 : 45, twin ? 190 : 130]} />
        <hemisphereLight args={["#9cc9ff", "#0b1422", 0.7]} />
        <directionalLight position={[30, 50, 20]} intensity={1.3} color="#dbe8ff" />
        <Environment resolution={64}>
          <Lightformer intensity={1.4} position={[0, 8, 0]} scale={[20, 20, 1]} rotation-x={Math.PI / 2} />
          <Lightformer intensity={0.8} color="#06B6D4" position={[-10, 2, -4]} rotation-y={Math.PI / 2} scale={[30, 2, 1]} />
          <Lightformer intensity={0.6} color="#8B5CF6" position={[10, 2, 4]} rotation-y={-Math.PI / 2} scale={[30, 2, 1]} />
        </Environment>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[320, 320]} />
          <meshStandardMaterial map={ground} roughness={1} />
        </mesh>
        <Buildings />
        <Roads congestion={props.congestion} closed={props.closed} selectedEdge={props.selectedEdge} onSelectEdge={props.onSelectEdge} />
        <Junctions selectedNode={props.selectedNode} onSelectNode={props.onSelectNode} />
        <Hazards congestion={props.congestion} closed={props.closed} incidents={props.incidents} />
        <Sim {...props} onFirstFrame={() => wrap.current?.setAttribute("data-scene-ready", "true")} />
        {twin ? (
          <>
            <Labels selectedNode={props.selectedNode} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.2} minDistance={8} maxDistance={150} />
          </>
        ) : (
          <DataRings />
        )}
      </Canvas>
    </div>
  );
}
