## Root cause
`src/routes/_authenticated/leads.tsx` is registered as the route `/_authenticated/leads`. Because of TanStack Router's dot-nesting, `leads.$leadId.tsx` becomes a **child** of `leads.tsx`. When navigating to `/leads/<id>`:

1. Row click fires and URL updates to `/leads/<id>` (verified — this works).
2. Router mounts the parent `leads.tsx` (the list page).
3. Router tries to mount the child `leads.$leadId.tsx` inside the parent's `<Outlet />`.
4. `leads.tsx` never renders `<Outlet />`, so the detail component never mounts and no lead fetch is issued.

Net effect: the URL is right but the detail page never appears — looking exactly like "clicking rows does nothing". Confirmed by empty `document.body` text and zero network calls for `id=eq.<id>`.

## Fix
Rename the list route so it stops being a layout for its siblings.

- `git mv src/routes/_authenticated/leads.tsx src/routes/_authenticated/leads.index.tsx`
- Inside the renamed file, change `createFileRoute("/_authenticated/leads")` → `createFileRoute("/_authenticated/leads/")` (TanStack's convention for index routes is the trailing slash — required for the route string to match the generated file id).

The Vite plugin will regenerate `src/routeTree.gen.ts` on next build/dev run:
- `/leads` → renders the list page (unchanged behavior).
- `/leads/$leadId` → renders the detail page as a top-level sibling with no parent-outlet dependency.

No other files change; the `<Link to="/leads/$leadId" params={{ leadId }}>` and `navigate(...)` calls already target the correct URL.

## Verify
- Reload `/pipeline`, click a card → detail page renders with lead title, stages, and activities.
- Go to `/leads`, click a row → detail page renders (bodyText no longer empty).
- Network shows `GET .../leads?select=*&id=eq.<id>` firing.
- `bun run build:dev` passes.