import { createFileRoute } from "@tanstack/react-router";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  return <KanbanBoard />;
}
