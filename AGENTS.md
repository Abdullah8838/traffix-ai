<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (TRAFFIX AI)

- Traffic logic lives in pure TypeScript under `src/lib/traffic/` (no React/three imports) with tests in `traffic.test.ts`; pages and scenes only render its output, so algorithms stay testable.
- The road graph in `src/lib/traffic/graph.ts` mirrors the seeded `roads` table codes (`e01`…); keep both in sync when adding roads.
- All `/app/*` pages are client-only (`ssr: false` on `src/routes/app.tsx`) because they depend on browser storage, Leaflet and WebGL.
- Leaflet and the R3F city are loaded via `React.lazy` behind `ClientOnly` (`TrafficMap`, `CityScene`) so they never evaluate during SSR of the landing page.
- Demo simulation settings (clock, demand, weather, local closures) live in `simStore` (localStorage); incidents and closures come from the database and merge in `useNetworkState`.
- Hex colours for WebGL/Leaflet come from `src/lib/palette.ts`, which mirrors the CSS tokens; components use Tailwind tokens.
- Admin permissions are enforced by RLS via `has_role`; the first signed-up account receives the admin role through the `handle_new_user` trigger.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are off: graph/instanced-mesh code indexes arrays heavily and optional props pass `undefined` through.
