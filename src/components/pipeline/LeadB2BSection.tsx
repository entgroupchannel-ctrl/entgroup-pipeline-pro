/**
 * LeadB2BSection — แสดงรายละเอียด B2B request ที่ match กับ lead นี้
 * รวมถึงรายการสินค้า พร้อม hint ให้ sales ทำใบเสนอราคาใน FlowAccount ต่อ
 */
import { useEffect, useState } from "react";
import { Loader2, Building2, Phone, Mail, ExternalLink, ShoppingCart, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBaht } from "@/lib/format";
import { fetchQuoteById, STATUS_LABEL, STATUS_COLOR, type B2BQuoteRequest } from "@/lib/b2b-client";

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()+543}`;
}

interface Props {
  b2bRequestId: string;
  b2bSnapshot?: any; // cached data from lead.b2b_data
  flowaccountUrl?: string | null;
  onCreateQuote?: () => void;
}

export function LeadB2BSection({ b2bRequestId, b2bSnapshot, flowaccountUrl, onCreateQuote }: Props) {
  const [req, setReq] = useState<B2BQuoteRequest | null>(b2bSnapshot ?? null);
  const [loading, setLoading] = useState(!b2bSnapshot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (b2bSnapshot) return; // use cached snapshot
    fetchQuoteById(b2bRequestId)
      .then((data) => setReq(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [b2bRequestId]);

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (error || !req) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-sm text-amber-700 dark:text-amber-300">
        {error ?? "ไม่พบข้อมูล B2B request"} — ข้อมูล snapshot อยู่ใน lead
      </p>
    </div>
  );

  const isSlaUrgent = req.sla_po_review_due && new Date(req.sla_po_review_due).getTime() - Date.now() < 12*3600*1000;

  return (
    <div className="space-y-4">

      {/* Status banner */}
      {isSlaUrgent && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">SLA ด่วน — ต้อง review ก่อน {fmtDate(req.sla_po_review_due!)}</p>
        </div>
      )}

      {/* Header card */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold">{req.quote_number}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[req.status] ?? "bg-muted"}`}>
                {STATUS_LABEL[req.status] ?? req.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> รับงานเมื่อ {fmtDate(req.created_at)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-primary">{formatBaht(req.grand_total)}</div>
            <div className="text-[10px] text-muted-foreground">มูลค่า B2B</div>
          </div>
        </div>

        {/* Customer info */}
        <div className="border-t pt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground mb-0.5">ลูกค้า</div>
            <div className="font-medium flex items-center gap-1"><Building2 className="h-3 w-3" />{req.customer_company}</div>
            <div className="text-muted-foreground">{req.customer_name}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">ช่องทางติดต่อ</div>
            {req.customer_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.customer_phone}</div>}
            {req.customer_email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.customer_email}</div>}
          </div>
        </div>
      </div>

      {/* Product items */}
      {req.items && req.items.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              รายการสินค้า ({req.items.length} รายการ)
            </h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">สินค้า</th>
                <th className="px-4 py-2.5 text-right font-medium">จำนวน</th>
                <th className="px-4 py-2.5 text-right font-medium">ราคา/หน่วย</th>
                <th className="px-4 py-2.5 text-right font-medium">รวม</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {req.items.map((item, i) => (
                <tr key={item.id ?? i} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.product_name}</div>
                    {item.description && <div className="text-muted-foreground mt-0.5">{item.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatBaht(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatBaht(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20">
                <td colSpan={3} className="px-4 py-3 text-right font-semibold">มูลค่ารวม</td>
                <td className="px-4 py-3 text-right text-base font-bold text-primary">{formatBaht(req.grand_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* FlowAccount hint */}
      <div className={`rounded-xl border p-4 space-y-2 ${flowaccountUrl ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-dashed"}`}>
        {flowaccountUrl ? (
          <>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">✓ ทำใบเสนอราคาใน FlowAccount แล้ว</p>
            <a href={flowaccountUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> เปิดใบเสนอราคา FlowAccount
            </a>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-muted-foreground">ขั้นตอนต่อไป</p>
            <p className="text-xs text-muted-foreground">ใช้รายการสินค้าด้านบนเป็น reference แล้วสร้างใบเสนอราคาอย่างเป็นทางการใน FlowAccount</p>
            {onCreateQuote && (
              <Button size="sm" variant="outline" onClick={onCreateQuote}>
                สร้างใบเสนอราคาใน FlowAccount →
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
