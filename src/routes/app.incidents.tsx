import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, Plus } from "lucide-react";
import { PageHeader, Panel, StatCard } from "@/components/app/ui";
import { IncidentTable } from "@/components/app/IncidentTable";
import { useIncidents } from "@/hooks/use-traffic-data";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, ShieldX, TriangleAlert } from "lucide-react";

export const Route = createFileRoute("/app/incidents")({
  head: () => ({
    meta: [
      { title: "Incident Management — TRAFFIX AI" },
      { name: "description", content: "Track reported incidents, multi-report verification, confidence and status across Bengaluru." },
      { property: "og:title", content: "Incident Management — TRAFFIX AI" },
      { property: "og:description", content: "Incident tracking with verification and status workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Incidents,
});

function Incidents() {
  const { data = [] } = useIncidents();
  const { isAdmin } = useAuth();
  const count = (s: string) => data.filter((i) => i.status === s).length;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Incident Management"
        description={isAdmin ? "You're an administrator: approve, reject or resolve incidents directly from the table." : "Track incident status. Only administrators can approve, reject or resolve incidents."}
        actions={<Button asChild><Link to="/app/report"><Plus /> Report incident</Link></Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending review" value={count("pending")} icon={Clock} tone="amber" />
        <StatCard label="Verified" value={count("verified")} icon={TriangleAlert} tone="red" />
        <StatCard label="Resolved" value={count("resolved")} icon={CheckCircle2} tone="green" />
        <StatCard label="Rejected" value={count("rejected")} icon={ShieldX} tone="blue" />
      </div>
      <Panel title="All incidents" icon={ListChecks}>
        <IncidentTable adminMode={isAdmin} />
      </Panel>
    </div>
  );
}
