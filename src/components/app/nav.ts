import {
  Ambulance,
  BarChart3,
  Box,
  BrainCircuit,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Map,
  Network,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrafficCone,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to:
    | "/app"
    | "/app/map"
    | "/app/routes"
    | "/app/prediction"
    | "/app/report"
    | "/app/incidents"
    | "/app/impact"
    | "/app/signals"
    | "/app/emergency"
    | "/app/optimize"
    | "/app/twin"
    | "/app/whatif"
    | "/app/analytics"
    | "/app/admin"
    | "/app/settings";
  label: string;
  icon: LucideIcon;
  group: "Command" | "Intelligence" | "Control" | "Simulation" | "System";
}

export const NAV: NavItem[] = [
  { to: "/app", label: "Overview Dashboard", icon: LayoutDashboard, group: "Command" },
  { to: "/app/map", label: "Live Traffic Map", icon: Map, group: "Command" },
  { to: "/app/routes", label: "Smart Route Planner", icon: RouteIcon, group: "Command" },
  { to: "/app/prediction", label: "AI Congestion Prediction", icon: BrainCircuit, group: "Intelligence" },
  { to: "/app/report", label: "Incident Reporting", icon: TriangleAlert, group: "Intelligence" },
  { to: "/app/incidents", label: "Incident Management", icon: ListChecks, group: "Intelligence" },
  { to: "/app/impact", label: "Network Impact Analysis", icon: Network, group: "Intelligence" },
  { to: "/app/signals", label: "Adaptive Traffic Signals", icon: TrafficCone, group: "Control" },
  { to: "/app/emergency", label: "Emergency Priority Routing", icon: Ambulance, group: "Control" },
  { to: "/app/optimize", label: "Multi-Factor Optimization", icon: SlidersHorizontal, group: "Control" },
  { to: "/app/twin", label: "3D Digital Twin", icon: Box, group: "Simulation" },
  { to: "/app/whatif", label: "What-If Simulator", icon: FlaskConical, group: "Simulation" },
  { to: "/app/analytics", label: "Analytics & Reports", icon: BarChart3, group: "System" },
  { to: "/app/admin", label: "Admin Dashboard", icon: ShieldCheck, group: "System" },
  { to: "/app/settings", label: "Settings", icon: Settings, group: "System" },
];
