import { useEffect, useState } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, Plus,
  Building2, Phone, Mail, ShoppingCart, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import {
  fetchUnmatchedQuotes, claimQuoteRequest,
  STATUS_LABEL, STATUS_COLOR, type B2BQuoteRequest,
} from "@/lib/b2b-client";

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${String(d.getFullYear()+543).slice(-2)}`;
}

export function B2BRequestsTab({ onLeadCreated }: { onLeadCreated?: () => void }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<B2BQuoteRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<B2BQuoteRequest | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

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

  const filtered = requests.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.quote_number.toLowerCase().includes(q) ||
      r.customer_company.toLowerCase().includes(q) ||
      r.customer_name.toLowerCase().includes(q)
    );
  });

  const doClaimRequest = async (req: B2BQuoteRequest) => {
    setClaiming(req.id);
    try {
      let accountId: string | null = null;
      if (req.customer_company) {
        const { data: existing } = await crmDb()
          .from("accounts").select("id").ilike("name", req.customer_company).limit(1).maybeSingle();
        if (existing) {
          accountId = existing.id;
        } else {
          const { data: newAcc } = await crmDb()
            .from("accounts").insert({ name: req.customer_company, source: "b2b" }).select("id").single();
          accountId = newAcc?.id ?? null;
        }
      }
      const { data: lead, error: leadErr } = await crmDb()
        .from("leads")
        .insert({
          title: null, stage: "new", source: "b2b",
          expected_value: req.grand_total, account_id: accountId,
          owner_id: user?.id,
          b2b_request_id: req.id, b2b_quote_number: req.quote_number,
          b2b_customer_name: req.customer_name, b2b_customer_company: req.customer_company,
          b2b_grand_total: req.grand_total, b2b_status: req.status, b2b_data: req as any,
        })
        .select("id").single();
      if (leadErr) throw new Error(leadErr.message);

      const claimResult = await claimQuoteRequest(req.id, lead.id);
      if ("error" in claimResult && claimResult.status === 409) {
        toast.warning("Lead ถูกสร้างแล้ว แต่ B2B ระบุว่ามี sales อื่นรับงานนี้ไปก่อน");
      }
      await crmDb().from("activities").insert({
        lead_id: lead.id, type: "note",
        subject: `รับงานจาก B2B Platform — ${req.quote_number}`,
        body: JSON.stringify({ items: req.items }),
        done: true, done_at: new Date().toISOString(), owner_id: user?.id,
      });
      toast.success(`รับงานแล้ว — สร้าง Lead สำหรับ ${req.customer_company}`);
      setClaimedIds((prev) => new Set([...prev, req.id]));
      onLeadCreated?.();
    } catch (e: any) {
      toast.error("รับงานไม่สำเร็จ", { description: e.message });
    } finally {
      setClaiming(null);
    }
  };

  const toggleItems = (id: string) =>
    setExpandedItems((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-background">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            B2B Requests
            {!loading && requests.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                {requests.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">ใบขอเสนอราคาจาก B2B Platform ที่ยังไม่ได้รับงาน</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Input
              placeholder="ค้นหาเลขที่ / บริษัท..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-3 text-xs"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-600" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={load}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> ลองใหม่
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">{search ? "ไม่พบรายการที่ค้นหา" : "ไม่มีคำขอใหม่"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-5 py-3 text-left font-normal w-28">วันที่</th>
                  <th className="px-5 py-3 text-left font-normal w-40">เลขที่ QT</th>
                  <th className="px-5 py-3 text-left font-normal">บริษัท / รายการ</th>
                  <th className="px-5 py-3 text-left font-normal w-48">ผู้ติดต่อ</th>
                  <th className="px-5 py-3 text-right font-normal w-32">มูลค่ารวม</th>
                  <th className="px-5 py-3 text-left font-normal w-32">สถานะ</th>
                  <th className="px-4 py-3 w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((req) => {
                  const isExpanded = expandedItems.has(req.id);
                  const firstItem = req.items?.[0];
                  const moreCount = (req.items?.length ?? 0) - 1;
                  return (
                    <>
                      <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                          {fmtDate(req.created_at)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                            <span className="font-mono text-[13px]">{req.quote_number}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-medium truncate max-w-[280px]">{req.customer_company}</div>
                          {firstItem && (
                            <div className="text-xs text-muted-foreground truncate max-w-[280px] mt-0.5">
                              {firstItem.product_name}
                              {moreCount > 0 && <span className="ml-1">+{moreCount} รายการ</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm truncate">{req.customer_name}</div>
                          {req.customer_phone && (
                            <div className="text-xs text-muted-foreground mt-0.5">{req.customer_phone}</div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap tabular-nums">
                          {req.grand_total > 0 ? formatBaht(req.grand_total) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${STATUS_COLOR[req.status] ?? "text-muted-foreground"}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {STATUS_LABEL[req.status] ?? req.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {req.items && req.items.length > 0 && (
                              <button
                                onClick={() => toggleItems(req.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors"
                                title={isExpanded ? "ซ่อนรายการ" : "ดูรายการทั้งหมด"}
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {claimedIds.has(req.id) ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-muted bg-muted/50 px-3 py-1 text-xs text-muted-foreground cursor-not-allowed select-none">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> รับงานแล้ว
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs"
                                onClick={() => setConfirmReq(req)}
                                disabled={claiming === req.id}
                              >
                                {claiming === req.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <><Plus className="mr-1 h-3 w-3" />รับงาน</>}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && req.items && req.items.length > 0 && (
                        <tr key={`${req.id}-items`} className="bg-muted/10">
                          <td colSpan={7} className="px-8 py-4">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="pb-2 text-left font-normal">สินค้า</th>
                                  <th className="pb-2 text-right font-normal w-20">จำนวน</th>
                                  <th className="pb-2 text-right font-normal w-32">ราคา/หน่วย</th>
                                  <th className="pb-2 text-right font-normal w-32">รวม</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/50">
                                {req.items.map((item, i) => (
                                  <tr key={item.id ?? i}>
                                    <td className="py-2">
                                      <span className="font-medium">{item.product_name}</span>
                                      {item.description && <span className="ml-2 text-muted-foreground">{item.description}</span>}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                                    <td className="py-2 text-right tabular-nums">{formatBaht(item.unit_price)}</td>
                                    <td className="py-2 text-right tabular-nums font-medium">{formatBaht(item.total_price)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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


      {/* Confirm claim dialog */}
      <Dialog open={!!confirmReq} onOpenChange={() => setConfirmReq(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              รับงาน — {confirmReq?.quote_number}
            </DialogTitle>
          </DialogHeader>

          {confirmReq && (
            <div className="space-y-4">
              {/* ข้อมูลลูกค้า */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-1.5 text-sm">
                <div className="font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {confirmReq.customer_company}
                </div>
                <div className="text-muted-foreground text-xs">{confirmReq.customer_name}</div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {confirmReq.customer_phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{confirmReq.customer_phone}</span>
                  )}
                  {confirmReq.customer_email && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{confirmReq.customer_email}</span>
                  )}
                </div>
              </div>

              {/* รายการสินค้า */}
              {confirmReq.items && confirmReq.items.length > 0 && (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                        <th className="px-3 py-2 text-right font-medium w-14">จำนวน</th>
                        <th className="px-3 py-2 text-right font-medium w-24">รวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {confirmReq.items.map((item, i) => (
                        <tr key={item.id ?? i}>
                          <td className="px-3 py-2 font-medium">{item.product_name}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{item.quantity}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatBaht(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/20">
                        <td colSpan={2} className="px-3 py-2 text-right font-semibold text-xs">มูลค่ารวม</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">{formatBaht(confirmReq.grand_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ข้อมูลที่ระบบจะสร้าง */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs space-y-1">
                <p className="font-semibold text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> ระบบจะดำเนินการให้อัตโนมัติ
                </p>
                <ul className="text-muted-foreground space-y-0.5 pl-5">
                  <li>สร้าง Lead ใหม่พร้อมเลขที่ดีล (D-YYYYMMDD-NNN)</li>
                  <li>สร้าง/เชื่อมโยงบริษัท "{confirmReq.customer_company}"</li>
                  <li>บันทึก activity log อัตโนมัติ</li>
                  <li>ขั้นตอนถัดไป: ทำใบเสนอราคาใน FlowAccount</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="ghost" onClick={() => setConfirmReq(null)}>ยกเลิก</Button>
                <Button
                  onClick={async () => {
                    const req = confirmReq;
                    setConfirmReq(null);
                    await doClaimRequest(req);
                  }}
                  disabled={claiming === confirmReq?.id}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> ยืนยัน รับงาน
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
