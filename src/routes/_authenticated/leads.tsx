import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/leads")({
  component: () => <ComingSoon title="รายการดีล" description="ตารางรวมดีลพร้อมฟิลเตอร์ กำลังพัฒนา" />,
});
