/**
 * B2BRequestsTab — แสดง quote_requests จาก B2B Platform ที่ยังไม่ได้ match กับ lead
 * Sales กด "รับงาน" → สร้าง Lead อัตโนมัติใน CRM
 */
import { useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Building2, Phone, Mail, ShoppingCart,
  ChevronDown, ChevronUp, Plus, AlertTriangle, Clock, Package,
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
          <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
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
      <div className="flex-1 overflow-auto p-4">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">ไม่มีคำขอใหม่</p>
            <p className="text-xs mt-1 opacity-60">ทุก request ถูกรับงานแล้ว</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden min-w-[1100px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-32">เลขที่ QT</th>
                  <th className="px-4 py-3 text-left font-medium w-28">สถานะ</th>
                  <th className="px-4 py-3 text-left font-medium">บริษัท</th>
                  <th className="px-4 py-3 text-left font-medium">ผู้ติดต่อ</th>
                  <th className="px-4 py-3 text-left font-medium">โทรศัพท์</th>
                  <th className="px-4 py-3 text-left font-medium">อีเมล</th>
                  <th className="px-4 py-3 text-right font-medium w-28">มูลค่า</th>
                  <th className="px-4 py-3 text-left font-medium w-28">วันที่</th>
                  <th className="px-4 py-3 text-center font-medium w-20">รายการ</th>
                  <th className="px-3 py-3 text-right w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((req) => {
                  const isExp = expanded.has(req.id);
                  const urgent = isSlaUrgent(req.sla_po_review_due);

                  return (
                    <>
                      <tr
                        key={req.id}
                        className="group hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(req.id)}
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-sm font-medium text-foreground">{req.quote_number}</span>
                          {urgent && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-300">
                              <AlertTriangle className="h-2.5 w-2.5" /> SLA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground"}`}>
                            {STATUS_LABEL[req.status] ?? req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-foreground">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate max-w-[180px]">{req.customer_company}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-foreground">
                          {req.customer_name || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          {req.customer_phone ? (
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.customer_phone}</span>
                          ) : <span>—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          {req.customer_email ? (
                            <span className="flex items-center gap-1 truncate max-w-[160px]"><Mail className="h-3 w-3 shrink-0" />{req.customer_email}</span>
                          ) : <span>—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm font-medium tabular-nums whitespace-nowrap text-foreground">
                          {formatBaht(req.grand_total)}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(req.created_at)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-xs text-foreground">
                          {req.items && req.items.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              <Package className="h-3 w-3" /> {req.items.length}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
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
                        </td>
                      </tr>

                      {/* Expanded: product items + SLA */}
                      {isExp && req.items && req.items.length > 0 && (
                        <tr className="bg-muted/30">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              รายการสินค้า
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground">
                                    <th className="pb-1.5 text-left font-medium">สินค้า</th>
                                    <th className="pb-1.5 text-right font-medium w-20">จำนวน</th>
                                    <th className="pb-1.5 text-right font-medium w-28">ราคาต่อหน่วย</th>
                                    <th className="pb-1.5 text-right font-medium w-28">รวม</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {req.items.map((item, i) => (
                                    <tr key={item.id ?? i}>
                                      <td className="py-1.5">
                                        <div className="font-medium text-foreground">{item.product_name}</div>
                                        {item.description && <div className="text-muted-foreground">{item.description}</div>}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                                      <td className="py-1.5 text-right tabular-nums">{formatBaht(item.unit_price)}</td>
                                      <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{formatBaht(item.total_price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-border">
                                    <td colSpan={3} className="pt-2 text-right font-semibold text-foreground">รวมทั้งสิ้น</td>
                                    <td className="pt-2 text-right font-bold text-foreground">{formatBaht(req.grand_total)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                            {req.sla_po_review_due && (
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                SLA รีวิว PO: {fmtDate(req.sla_po_review_due)} {urgent && <span className="text-red-600 font-medium">(ใกล้ครบกำหนด)</span>}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="px-6 pb-2 text-xs text-muted-foreground text-center">
        คลิกแถวเพื่อดูรายละเอียดสินค้า
      </p>
    </div>
  );
}
