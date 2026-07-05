/**
 * B2BRequestsTab — แสดง quote_requests จาก B2B Platform ที่ยังไม่ได้ match กับ lead
 * Sales กด "รับงาน" → สร้าง Lead อัตโนมัติใน CRM
 */
import { useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Building2, Phone, Mail, ShoppingCart,
  ChevronDown, ChevronUp, Plus, AlertTriangle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import {
  fetchUnmatchedQuotes, claimQuoteRequest, STATUS_LABEL, STATUS_COLOR,
  type B2BQuoteRequest,
} from "@/lib/b2b-client";

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()+543}`;
}
function isSlaUrgent(sla?: string) {
  if (!sla) return false;
  return new Date(sla).getTime() - Date.now() < 12*3600*1000;
}

export function B2BRequestsTab({ onLeadCreated }: { onLeadCreated?: () => void }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<B2BQuoteRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchUnmatchedQuotes(50);
      setRequests(data);
    } catch (e: any) {
      setError(e.message ?? "เชื่อมต่อ B2B ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const claimRequest = async (req: B2BQuoteRequest) => {
    if (!confirm(`รับงาน "${req.quote_number}" — ${req.customer_company} ?\n\nระบบจะสร้าง Lead ใหม่ใน CRM อัตโนมัติ`)) return;
    setClaiming(req.id);
    try {
      // 1. Find or create account by company name
      let accountId: string | null = null;
      if (req.customer_company) {
        const { data: existing } = await crmDb()
          .from("accounts")
          .select("id")
          .ilike("name", req.customer_company)
          .limit(1)
          .maybeSingle();
        if (existing) {
          accountId = existing.id;
        } else {
          const { data: newAcc } = await crmDb()
            .from("accounts")
            .insert({ name: req.customer_company, source: "b2b", industry: null })
            .select("id")
            .single();
          accountId = newAcc?.id ?? null;
        }
      }

      // 2. Create lead
      const { data: lead, error: leadErr } = await crmDb()
        .from("leads")
        .insert({
          title: `[B2B] ${req.customer_company} — ${req.quote_number}`,
          stage: "new",
          source: "b2b",
          expected_value: req.grand_total,
          account_id: accountId,
          owner_id: user?.id,
          b2b_request_id: req.id,
          b2b_quote_number: req.quote_number,
          b2b_customer_name: req.customer_name,
          b2b_customer_company: req.customer_company,
          b2b_grand_total: req.grand_total,
          b2b_status: req.status,
          b2b_data: req as any,
        })
        .select("id")
        .single();

      if (leadErr) throw new Error(leadErr.message);

      // 3. Log activity
      await crmDb().from("activities").insert({
        lead_id: lead.id,
        type: "note",
        subject: `รับงานจาก B2B Platform — ${req.quote_number}`,
        body: JSON.stringify({ items: req.items }),
        done: true,
        done_at: new Date().toISOString(),
        owner_id: user?.id,
      });

      // 4. Claim ที่ B2B (set crm_lead_id เพื่อกัน race)
      const claim = await claimQuoteRequest(req.id, lead.id);
      if (!claim.ok) {
        if (claim.conflict) {
          toast.warning("Lead ถูกสร้างแล้ว แต่ B2B ระบุว่ามี sales อื่นรับงานนี้ไปก่อน", {
            description: "ตรวจสอบกับทีมก่อนดำเนินการต่อ",
          });
        } else {
          toast.warning("Lead ถูกสร้างแล้ว แต่ sync กลับไป B2B ไม่สำเร็จ", {
            description: claim.error,
          });
        }
      } else {
        toast.success(`รับงานแล้ว — Lead ถูกสร้างสำหรับ ${req.customer_company}`);
      }
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      onLeadCreated?.();
    } catch (e: any) {
      toast.error("รับงานไม่สำเร็จ", { description: e.message });
    } finally {
      setClaiming(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-600" />
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
      <p className="mt-1 text-xs text-amber-600">ตรวจสอบว่า Edge Function b2b-quotes deploy แล้ว</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={load}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> ลองใหม่
      </Button>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            🛒 B2B Requests
            {requests.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {requests.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">ใบขอเสนอราคาจาก B2B Platform ที่ยังไม่ได้รับงาน</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">ไม่มีคำขอใหม่</p>
            <p className="text-xs mt-1 opacity-60">ทุก request ถูกรับงานแล้ว</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const isExp = expanded.has(req.id);
              const urgent = isSlaUrgent(req.sla_po_review_due);
              return (
                <div
                  key={req.id}
                  className={`rounded-xl border bg-card overflow-hidden transition-colors ${
                    urgent ? "border-red-300 dark:border-red-700" : ""
                  }`}
                >
                  {/* Summary row */}
                  <div className="flex items-start gap-3 p-4">
                    {/* Company avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {(req.customer_company || req.customer_name || "?").slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{req.quote_number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABEL[req.status] ?? req.status}
                        </span>
                        {urgent && (
                          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            <AlertTriangle className="h-2.5 w-2.5" /> SLA ด่วน
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {req.customer_company}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{req.customer_name}</span>
                        {req.customer_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.customer_phone}</span>}
                        {req.customer_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.customer_email}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{formatBaht(req.grand_total)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(req.created_at)}</span>
                        {req.items && <span>{req.items.length} รายการ</span>}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-1.5 items-end">
                      <Button
                        size="sm"
                        onClick={() => claimRequest(req)}
                        disabled={claiming === req.id}
                        className="h-7 px-3 text-xs"
                      >
                        {claiming === req.id
                          ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          : <Plus className="mr-1 h-3 w-3" />}
                        รับงาน
                      </Button>
                      <button
                        onClick={() => toggleExpand(req.id)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {isExp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {isExp ? "ย่อ" : "รายละเอียด"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded: product items */}
                  {isExp && req.items && req.items.length > 0 && (
                    <div className="border-t bg-muted/20 px-4 py-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">รายการสินค้า</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="pb-1 text-left font-medium">สินค้า</th>
                            <th className="pb-1 text-right font-medium">จำนวน</th>
                            <th className="pb-1 text-right font-medium">ราคาต่อหน่วย</th>
                            <th className="pb-1 text-right font-medium">รวม</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {req.items.map((item, i) => (
                            <tr key={item.id ?? i} className="text-xs">
                              <td className="py-1.5">
                                <div className="font-medium">{item.product_name}</div>
                                {item.description && <div className="text-muted-foreground">{item.description}</div>}
                              </td>
                              <td className="py-1.5 text-right">{item.quantity}</td>
                              <td className="py-1.5 text-right">{formatBaht(item.unit_price)}</td>
                              <td className="py-1.5 text-right font-medium">{formatBaht(item.total_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t">
                            <td colSpan={3} className="pt-2 text-right font-semibold">รวมทั้งสิ้น</td>
                            <td className="pt-2 text-right font-bold text-primary">{formatBaht(req.grand_total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
