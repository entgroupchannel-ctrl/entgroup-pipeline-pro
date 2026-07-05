import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Check, X, Clock, ChevronRight, AlertTriangle, Loader2, User, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crmDb, STAGE_LABEL_TH, type LeadStage } from "@/lib/crm";
import { formatThaiDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
});

interface StageRequest {
  id: string;
  lead_id: string;
  requested_by: string;
  from_stage: string;
  to_stage: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  // joined
  lead_title?: string;
  requester_name?: string;
}

type FilterKey = "pending" | "approved" | "rejected" | "all";

const FILTER_LABEL: Record<FilterKey, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธแล้ว",
  all: "ทั้งหมด",
};

const STAGE_COLOR: Record<string, string> = {
  new:         "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  qualified:   "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  proposal:    "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  negotiation: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  closing:     "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  won:         "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  lost:        "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function ApprovalsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isManager = role === "manager" || role === "admin";

  const [requests, setRequests] = useState<StageRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [leads, setLeads] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("pending");

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<StageRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [reqRes, profRes, leadRes] = await Promise.all([
      crmDb().from("stage_change_requests").select("*").order("created_at", { ascending: false }),
      crmDb().from("user_profiles").select("id,full_name"),
      crmDb().from("leads").select("id,title"),
    ]);
    if (reqRes.error) { toast.error("โหลดไม่สำเร็จ"); setLoading(false); return; }
    setRequests((reqRes.data ?? []) as StageRequest[]);
    setProfiles(new Map((profRes.data ?? []).map((p: any) => [p.id, p.full_name ?? p.id.slice(0, 8)])));
    setLeads(new Map((leadRes.data ?? []).map((l: any) => [l.id, l.title])));
    setLoading(false);
  };

  useEffect(() => {
    if (!isManager) { navigate({ to: "/pipeline" }); return; }
    load();
  }, [isManager]);

  const filtered = requests.filter((r) =>
    filter === "all" ? true : r.status === filter
  );

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const openReview = (req: StageRequest, action: "approved" | "rejected") => {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewNote("");
    setReviewOpen(true);
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    if (reviewAction === "rejected" && !reviewNote.trim()) {
      toast.error("กรุณาระบุเหตุผลการปฏิเสธ");
      return;
    }
    setReviewing(true);
    try {
      const { error: updateErr } = await crmDb()
        .from("stage_change_requests")
        .update({
          status: reviewAction,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote.trim() || null,
        })
        .eq("id", reviewTarget.id);
      if (updateErr) throw updateErr;

      // If approved → actually change the stage
      if (reviewAction === "approved") {
        const { error: stageErr } = await crmDb()
          .from("leads")
          .update({ stage: reviewTarget.to_stage })
          .eq("id", reviewTarget.lead_id);
        if (stageErr) throw stageErr;

        // Log activity
        await crmDb().from("activities").insert({
          lead_id: reviewTarget.lead_id,
          type: "note",
          subject: `[อนุมัติ] ถอย stage: ${STAGE_LABEL_TH[reviewTarget.from_stage as LeadStage]} → ${STAGE_LABEL_TH[reviewTarget.to_stage as LeadStage]}`,
          body: reviewNote || null,
          done: true,
          done_at: new Date().toISOString(),
          owner_id: user?.id,
        });

        toast.success("อนุมัติแล้ว — stage ถูกเปลี่ยนแล้ว");
      } else {
        toast.success("ปฏิเสธแล้ว — Sales จะได้รับแจ้ง");
      }

      setReviewOpen(false);
      load();
    } catch (err: any) {
      toast.error("ดำเนินการไม่สำเร็จ", { description: err?.message });
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="p-6 page-fade-in max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            คำขออนุมัติ
            {pendingCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">คำขอถอย stage จาก Sales — อนุมัติหรือปฏิเสธได้ที่นี่</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => {
          const count = k === "all" ? requests.length : requests.filter((r) => r.status === k).length;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : k === "pending" && count > 0
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {FILTER_LABEL[k]}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === k ? "bg-white/20" :
                  k === "pending" && count > 0 ? "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100" :
                  "bg-muted text-muted-foreground"
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <Check className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {filter === "pending" ? "ไม่มีคำขอที่รออนุมัติ" : "ไม่มีรายการ"}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card overflow-hidden">
          {filtered.map((req) => {
            const requesterName = profiles.get(req.requested_by) ?? "—";
            const leadTitle = leads.get(req.lead_id) ?? req.lead_id.slice(0, 8);
            const reviewerName = req.reviewed_by ? profiles.get(req.reviewed_by) : null;
            return (
              <li key={req.id} className="px-5 py-4">
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary mt-0.5">
                    {requesterName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{requesterName}</span>
                      <span className="text-xs text-muted-foreground">ขอถอย stage</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_COLOR[req.from_stage]}`}>
                        {STAGE_LABEL_TH[req.from_stage as LeadStage]}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_COLOR[req.to_stage]}`}>
                        {STAGE_LABEL_TH[req.to_stage as LeadStage]}
                      </span>
                    </div>

                    {/* Lead link */}
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: req.lead_id }}
                      className="text-xs text-primary hover:underline"
                    >
                      ดีล: {leadTitle}
                    </Link>

                    {/* Reason */}
                    <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">เหตุผล: </span>
                      {req.reason}
                    </div>

                    {/* Meta */}
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{formatThaiDate(req.created_at)}</span>
                      {req.status === "pending" && (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Clock className="h-3 w-3" /> รออนุมัติ
                        </span>
                      )}
                      {req.status === "approved" && (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Check className="h-3 w-3" /> อนุมัติโดย {reviewerName}
                        </span>
                      )}
                      {req.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <X className="h-3 w-3" /> ปฏิเสธโดย {reviewerName}
                        </span>
                      )}
                    </div>

                    {/* Review note */}
                    {req.review_note && (
                      <div className="mt-1.5 text-[11px] text-muted-foreground italic border-l-2 border-muted pl-2">
                        หมายเหตุ: {req.review_note}
                      </div>
                    )}
                  </div>

                  {/* Action buttons — pending only */}
                  {req.status === "pending" && (
                    <div className="flex shrink-0 gap-1.5 ml-2">
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                        onClick={() => openReview(req, "approved")}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> อนุมัติ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-red-200 px-3 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                        onClick={() => openReview(req, "rejected")}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> ปฏิเสธ
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Review dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${
              reviewAction === "approved" ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"
            }`}>
              {reviewAction === "approved"
                ? <><Check className="h-5 w-5" /> ยืนยันอนุมัติ</>
                : <><X className="h-5 w-5" /> ยืนยันปฏิเสธ</>
              }
            </DialogTitle>
          </DialogHeader>

          {reviewTarget && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STAGE_COLOR[reviewTarget.from_stage]}`}>
                    {STAGE_LABEL_TH[reviewTarget.from_stage as LeadStage]}
                  </span>
                  <ChevronRight className="h-3 w-3" />
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STAGE_COLOR[reviewTarget.to_stage]}`}>
                    {STAGE_LABEL_TH[reviewTarget.to_stage as LeadStage]}
                  </span>
                </div>
                <div className="mt-1.5">เหตุผล: {reviewTarget.reason}</div>
              </div>

              {reviewAction === "approved" && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  stage จะถูกเปลี่ยนทันทีและบันทึกใน activity log
                </div>
              )}

              <div>
                <Label className="text-xs">
                  หมายเหตุ{reviewAction === "rejected" ? <span className="text-red-500"> *</span> : " (optional)"}
                </Label>
                <Textarea
                  rows={2}
                  placeholder={reviewAction === "approved"
                    ? "เช่น อนุมัติ เหตุผลสมเหตุสมผล"
                    : "เช่น ข้อมูลดีลยังถูกต้อง ไม่จำเป็นต้องถอย stage"}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>ยกเลิก</Button>
            <Button
              className={reviewAction === "approved"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-red-600 text-white hover:bg-red-700"}
              onClick={submitReview}
              disabled={reviewing || (reviewAction === "rejected" && !reviewNote.trim())}
            >
              {reviewing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {reviewAction === "approved" ? "ยืนยัน อนุมัติ" : "ยืนยัน ปฏิเสธ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
