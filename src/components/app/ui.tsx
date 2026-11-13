import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EDGES, NODES, type NodeId } from "@/lib/traffic/graph";
import { congestionLabel } from "@/lib/traffic/conditions";
import { useAuth } from "@/hooks/use-auth";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">{eyebrow}</div>}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, icon: Icon, actions, children, className, bodyClassName }: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("glass rounded-xl", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            {Icon && <Icon className="h-4 w-4 text-cyan" />}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

const TONES = {
  cyan: "text-cyan bg-cyan/10",
  blue: "text-primary bg-primary/10",
  violet: "text-violet bg-violet/10",
  green: "text-success bg-success/10",
  amber: "text-warning bg-warning/10",
  red: "text-danger bg-danger/10",
} as const;

export function StatCard({ label, value, hint, icon: Icon, tone = "cyan" }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <div className="glass rounded-xl p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={cn("grid h-8 w-8 place-items-center rounded-lg", TONES[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SimTag({ children = "Simulated" }: { children?: ReactNode }) {
  return (
    <Badge variant="violet" className="font-mono text-[10px] uppercase tracking-wider">
      {children}
    </Badge>
  );
}

export function CongestionBadge({ value }: { value: number }) {
  const l = congestionLabel(value);
  const v = l === "Free flow" ? "success" : l === "Moderate" ? "warning" : "danger";
  return (
    <Badge variant={v} className="tabular">
      {l} · {Math.round(value * 100)}%
    </Badge>
  );
}

export function Meter({ value, className }: { value: number; className?: string }) {
  const tone = value < 0.4 ? "bg-success" : value < 0.6 ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </div>
  );
}

export function NodeSelect({ label, value, onChange, exclude, id }: { label: string; value: NodeId | null; onChange: (v: NodeId) => void; exclude?: NodeId | null; id: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? undefined} onValueChange={(v) => onChange(v as NodeId)}>
        <SelectTrigger id={id} className="bg-background/40">
          <SelectValue placeholder="Choose a location" />
        </SelectTrigger>
        <SelectContent>
          {[...NODES]
            .sort((a, b) => a.name.localeCompare(b.name))
            .filter((n) => n.id !== exclude)
            .map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EdgeSelect({ label, value, onChange, id }: { label: string; value: string | null; onChange: (v: string) => void; id: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="bg-background/40">
          <SelectValue placeholder="Choose a road" />
        </SelectTrigger>
        <SelectContent>
          {[...EDGES]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SignInPrompt({ what }: { what: string }) {
  const { user } = useAuth();
  if (user) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs">
      <span className="text-muted-foreground">Sign in to {what}.</span>
      <Button asChild size="sm" variant="outline">
        <Link to="/auth">Sign in</Link>
      </Button>
    </div>
  );
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1 text-sm", className)}>
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium tabular">{v}</span>
    </div>
  );
}
