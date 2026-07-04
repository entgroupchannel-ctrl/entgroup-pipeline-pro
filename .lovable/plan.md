## Problem
After making the entire card draggable (dnd-kit `listeners` on the root `<div>`), clicking a card no longer opens the lead detail page. Root cause: attaching drag `listeners` and `onClick` to the same element is unreliable — dnd-kit's `PointerSensor` activator captures pointer events on the root, and even below the 6px activation threshold the resulting click can be swallowed / not fire consistently (especially after any tiny pointer jitter). This is the classic dnd-kit "draggable + clickable on the same node" gotcha.

## Fix
Detect a real click (pointer up without a drag having started) at the pointer layer instead of relying on the DOM `onClick` event.

Edit `src/components/pipeline/KanbanCard.tsx`:

1. Keep `{...attributes} {...listeners}` on the root card `<div>` so the whole card remains draggable.
2. Remove `onClick={onClick}` from the root.
3. Track pointerdown coordinates with a `useRef<{ x: number; y: number } | null>(null)`.
4. Add `onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY } }}` to the root (this fires before dnd-kit consumes it since React synthetic handlers run on bubble).
5. Add `onPointerUp={(e) => { const d = downRef.current; downRef.current = null; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) < 6) onClick?.(); }}` — fires only when the pointer barely moved, matching the sensor's 6px activation threshold, so real drags don't trigger navigation.
6. Keep the existing `onClick={(e) => e.stopPropagation()}` guards on the 3-dot menu wrapper. Add matching `onPointerUp={(e) => e.stopPropagation()}` on that wrapper (and on the priority chip wrapper if any) so clicking those inner controls does not bubble up and trigger `onClick`.
7. Leave PointerSensor `activationConstraint: { distance: 6 }` in `KanbanBoard.tsx` unchanged.

## Verify
- Drag a card body → moves between columns; toast confirms.
- Click (no drag) on the card body → navigates to `/leads/$leadId`.
- Click 3-dot menu → menu opens, no navigation.
- Click grip icon → no navigation (it's decorative now; a small click stays under 6px so it will actually navigate — acceptable, same as clicking the card body).
- Touch drag on mobile still works (`touch-none` already on root).
- `bun run build:dev` passes.