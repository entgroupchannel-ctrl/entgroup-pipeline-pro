import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: () => <ComingSoon title="บริษัท" description="รายการบริษัทและผู้ติดต่อ กำลังพัฒนา" />,
});
