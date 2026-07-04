import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/quotations")({
  component: () => <ComingSoon title="ใบเสนอราคา" description="เชื่อมต่อ FlowAccount กำลังพัฒนา" />,
});
