import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ExternalLink, Building2, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatBaht } from "@/lib/format";
import { createFAQuotationDraft } from "@/lib/flowaccount.functions";
import { fetchQuoteDetail, type B2BQuoteRequest } from "@/lib/b2b-client";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: B2BQuoteRequest | null;
  leadId?: string;
  onCreated?: (fa_url: string) => void;
}

export function CreateFAQuotationDialog({ open, onOpenChange, request, leadId, onCreated }: Props) {
  const createFn = useServerFn(createFAQuotationDraft);
  const [submitting, setSubmitting] = useState(false);

  // ── Customer ─────────────────────────────────────────────────────────────
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");

  // ── Items ────────────────────────────────────────────────────────────────
  type Row = { name: string; description: string; quantity: number; unit_price: number };
  const [items, setItems] = useState<Row[]>([]);

  // ── Meta ─────────────────────────────────────────────────────────────────
  const [issuedDate, setIssuedDate] = useState(todayISO());
  const [validUntil, setValidUntil] = useState(plusDaysISO(30));
  const [note, setNote] = useState("");
  const [vatOn, setVatOn] = useState(true);

  const applyRequest = (r: B2BQuoteRequest) => {
    setCompany(r.customer_company ?? "");
    setContactName(r.customer_name ?? "");
    setEmail(r.customer_email ?? "");
    setPhone(r.customer_phone ?? "");
    setAddress(r.customer_address ?? "");
    setTaxId(r.customer_tax_id ?? "");
    setNote(
      [`อ้างอิงจาก B2B Request: ${r.quote_number}`, r.notes || ""]
        .filter(Boolean).join("\n"),
    );
    if (r.vat_percent != null) setVatOn(Number(r.vat_percent) > 0);
    if (r.valid_until) setValidUntil(String(r.valid_until).slice(0, 10));

    // Prefer explicit items[] if present, otherwise map from products JSONB
    const rows: Row[] = (r.items && r.items.length)
      ? r.items.map((it) => ({
          name: it.product_name || "-",
          description: it.description || "",
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        }))
      : (r.products ?? []).map((p) => ({
          name: p.model || p.name || p.sku || "-",
          description: p.description || "",
          quantity: Number(p.qty ?? p.quantity) || 1,      // qty คือ field จริงใน B2B
          unit_price: Number(p.unit_price ?? p.price) || 0,
        }));
    setItems(rows);
  };

  useEffect(() => {
    if (!open || !request) return;
    setIssuedDate(todayISO());
    setValidUntil(plusDaysISO(30));
    setVatOn(true);
    applyRequest(request);
    // Enrich with full detail (address, tax_id, products) from edge function
    fetchQuoteDetail(request.id)
      .then((full) => { if (full) applyRequest(full); })
      .catch(() => { /* fallback to basic fields */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const subTotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0),
    [items],
  );
  const vatAmount = vatOn ? +(subTotal * 0.07).toFixed(2) : 0;
  const grandTotal = +(subTotal + vatAmount).toFixed(2);

  const updateItem = (idx: number, patch: Partial<Row>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, { name: "", description: "", quantity: 1, unit_price: 0 }]);

  const submit = async () => {
    if (!company.trim()) return toast.error("กรุณาระบุชื่อบริษัท");
    if (items.length === 0) return toast.error("ต้องมีรายการอย่างน้อย 1 รายการ");
    if (items.some((it) => !it.name.trim())) return toast.error("รายการสินค้าต้องมีชื่อ");

    setSubmitting(true);
    try {
      const res = await createFn({
        data: {
          customer: {
            company: company.trim(),
            contact_name: contactName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            address: address.trim(),
            tax_id: taxId.trim(),
          },
          items: items.map((it) => ({
            name: it.name.trim(),
            description: it.description.trim(),
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
          })),
          issued_date: issuedDate,
          valid_until: validUntil,
          note,
          vat_rate: vatOn ? 7 : 0,
          lead_id: leadId,
          b2b_request_id: request?.id,
        },
      });

      toast.success(`สร้าง QT ใน FlowAccount แล้ว — ${res.quotation_no || ""}`, {
        description: "เปิดในแท็บใหม่เพื่อตรวจสอบและส่งให้ลูกค้า",
      });
      if (res.fa_url) window.open(res.fa_url, "_blank", "noopener,noreferrer");
      onCreated?.(res.fa_url);
      onOpenChange(false);
    } catch (e: any) {
      toast.error("สร้าง QT ไม่สำเร็จ", { description: e?.message ?? "unknown error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            สร้างใบเสนอราคาที่ FlowAccount
            {request?.quote_number && (
              <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                {request.quote_number}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer */}
          <section className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              ข้อมูลลูกค้า
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">บริษัท *</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">ผู้ติดต่อ</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">เลขผู้เสียภาษี</Label>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">อีเมล</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">โทรศัพท์</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">ที่อยู่</Label>
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="text-sm" />
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">รายการสินค้า</div>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addItem}>
                <Plus className="h-3 w-3" /> เพิ่มรายการ
              </Button>
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  ยังไม่มีรายการ — คลิก "เพิ่มรายการ"
                </div>
              )}
              {items.map((it, idx) => {
                const line = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border bg-muted/20 p-2">
                    <div className="col-span-12 sm:col-span-5">
                      <Input
                        placeholder="ชื่อสินค้า"
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="รายละเอียด (ไม่บังคับ)"
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        className="mt-1 h-7 text-xs"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">จำนวน</Label>
                      <Input
                        type="number" min={0} step={1}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm tabular-nums"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">ราคา/หน่วย</Label>
                      <Input
                        type="number" min={0} step={0.01}
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm tabular-nums"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-right">
                      <Label className="text-[10px] text-muted-foreground">รวม</Label>
                      <div className="pt-1.5 text-sm font-medium tabular-nums">{formatBaht(line)}</div>
                    </div>
                    <div className="col-span-1 flex items-start justify-end">
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-500"
                        onClick={() => removeItem(idx)}
                        title="ลบรายการ"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Meta + totals */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">วันที่ออก</Label>
              <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">วันหมดอายุ</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-9" />
            </div>
            <div className="flex items-end gap-2">
              <Switch id="vat-toggle" checked={vatOn} onCheckedChange={setVatOn} />
              <Label htmlFor="vat-toggle" className="cursor-pointer text-sm">VAT 7%</Label>
            </div>
            <div className="sm:col-span-3">
              <Label className="text-xs">หมายเหตุ</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-sm" />
            </div>
          </section>

          {/* Totals summary */}
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-muted-foreground">ยอดรวม</span>
              <span className="tabular-nums">{formatBaht(subTotal)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-muted-foreground">VAT {vatOn ? "7%" : "0%"}</span>
              <span className="tabular-nums">{formatBaht(vatAmount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
              <span>ยอดสุทธิ</span>
              <span className="tabular-nums text-primary">{formatBaht(grandTotal)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={submitting} className="gap-2">
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> กำลังสร้าง…</>
            ) : (
              <>สร้างใน FlowAccount <ExternalLink className="h-4 w-4" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
