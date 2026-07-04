## Problem
On the Pipeline board, cards can no longer be moved by dragging their body. In the current `src/components/pipeline/KanbanCard.tsx`, the dnd-kit `listeners`/`attributes` are attached ONLY to the tiny `GripVertical` icon (about 16px). The rest of the card triggers `onClick` → navigates to the lead detail page. Users naturally grab the card body, so it feels "broken".

Root cause: drag activator area was reduced to the grip icon only.

## Fix
Restore whole-card dragging while keeping the row click → open behavior and preserving the 3-dot menu / grip.

Edit `src/components/pipeline/KanbanCard.tsx`:

1. Move `{...attributes} {...listeners}` from the `GripVertical` wrapper to the root card `<div>` (the one with `ref={setNodeRef}`).
2. Add `touch-none` to that root div so touch drags don't scroll.
3. Keep the small grip icon as a visual affordance (no listeners needed).
4. Keep `onClick={(e) => e.stopPropagation()}` wrappers around the 3-dot menu and any inline controls (priority chips, etc.) so clicking them doesn't open the lead.
5. Leave PointerSensor `activationConstraint: { distance: 6 }` as-is — that's what lets a short click still fire `onClick` instead of starting a drag.

No other files change. No logic in `KanbanBoard.tsx` needs to change.

## Verify
- Drag a card from its body across columns → stage updates + toast "ย้ายไป ...".
- Click (no drag) on a card → navigates to `/leads/$leadId`.
- Click the 3-dot menu or grip → does not navigate, does not start drag unintentionally.
- Run `bun run build:dev`.