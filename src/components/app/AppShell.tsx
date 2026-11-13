import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogIn, LogOut, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NAV } from "./nav";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/use-auth";
import { simStore, useSimSettings } from "@/lib/traffic/store";
import { useNetworkState } from "@/hooks/use-network";
import { formatClock } from "@/lib/traffic/conditions";
import { supabase } from "@/integrations/supabase/client";

const GROUPS = ["Command", "Intelligence", "Control", "Simulation", "System"] as const;

function NavLinks() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <>
      {GROUPS.map((g) => (
        <SidebarGroup key={g}>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.18em]">{g}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = n.to === "/app" ? path === "/app" || path === "/app/" : path.startsWith(n.to);
                return (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={n.label}>
                      <Link to={n.to} onClick={() => isMobile && setOpenMobile(false)}>
                        <n.icon className={active ? "text-cyan" : ""} />
                        <span>{n.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
  const unread = q.data?.filter((n) => !n.read).length ?? 0;
  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 glass-strong p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button className="text-xs text-cyan hover:underline" onClick={markAll}>
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {!user ? (
            <p className="p-4 text-xs text-muted-foreground">Sign in to receive updates about your incident reports.</p>
          ) : !q.data?.length ? (
            <p className="p-4 text-xs text-muted-foreground">No notifications yet.</p>
          ) : (
            q.data.map((n) => (
              <div key={n.id} className={`border-b px-3 py-2 last:border-0 ${n.read ? "opacity-60" : ""}`}>
                <div className="text-xs font-semibold">{n.title}</div>
                <div className="text-xs text-muted-foreground">{n.body}</div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TopBar() {
  const settings = useSimSettings();
  const { state } = useNetworkState();
  const { user, isAdmin, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => path.startsWith(n.to));
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/70 px-3 backdrop-blur-xl sm:px-4">
      <SidebarTrigger />
      <div className="hidden min-w-0 truncate text-sm font-semibold sm:block">{current?.label}</div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {settings.showDemoBadge && (
          <Badge variant="violet" className="gap-1.5 font-mono text-[10px] uppercase tracking-wider">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-violet animate-ping-soft" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet" />
            </span>
            Demo mode
          </Badge>
        )}
        <div className="hidden rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground md:block">
          BLR {formatClock(state.minutesOfDay)} {settings.liveClock ? "live" : "sim"}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            simStore.reset();
            toast.success("Demo reset", { description: "Simulation settings and local closures restored to defaults." });
          }}
        >
          <RotateCcw /> <span className="hidden sm:inline">Reset demo</span>
        </Button>
        <Notifications />
        {user ? (
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Badge variant="info" className="hidden gap-1 sm:inline-flex">
                <ShieldCheck className="h-3 w-3" /> Admin
              </Badge>
            )}
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => signOut().then(() => toast("Signed out"))}>
              <LogOut />
            </Button>
          </div>
        ) : (
          <Button asChild size="sm">
            <Link to="/auth">
              <LogIn /> Sign in
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="px-3 py-3">
          <Link to="/" className="block group-data-[collapsible=icon]:hidden">
            <Logo />
          </Link>
          <Link to="/" className="hidden group-data-[collapsible=icon]:block">
            <Logo compact />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
        <SidebarFooter className="group-data-[collapsible=icon]:hidden">
          <div className="rounded-lg border bg-background/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Systems nominal
            </div>
            Traffic is simulated for Bengaluru demo locations. Not live traffic data.
            {user && <div className="mt-1 truncate text-foreground/80">{user.email}</div>}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background bg-hero">
        <TopBar />
        <main className="min-w-0 flex-1 p-3 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
