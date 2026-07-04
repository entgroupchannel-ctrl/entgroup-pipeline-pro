import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => <ComingSoon title="Dashboard" description="สรุปยอดขายสำหรับผู้จัดการ กำลังพัฒนา" />,
});
