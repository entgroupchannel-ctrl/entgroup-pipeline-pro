import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/activities")({
  component: () => <ComingSoon title="กิจกรรม" description="ตารางนัดหมายและกิจกรรม กำลังพัฒนา" />,
});
