import { useEffect, useState } from "react";
import { Plus, FileDown, FileText, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht, formatThaiDate } from "@/lib/format";
import {
  type Quotation,
  type QuotationStatus,
  STATUS_LABEL,
  STATUS_COLOR,
  QuotationFormDialog,
  FAImportToQuotationDialog,
} from "@/routes/_authenticated/quotations";
import { toast } from "sonner";

interface Props {
  leadId: string;
  accountId?: string | null;
}

export function LeadQuotationsSection({ leadId, accountId }: Props) {
  const { role } = useAuth();
  const isManager = role === "manager" || role === "admin";

  const [rows, setRows] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [faOpen, setFaOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await crmDb()
      .from("quotations")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) toast.error("โหลดใบเสนอราคาไม่สำเร็จ", { description: error.message });
    setRows((data ?? []) as Quotation[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const updateStatus = async (id: string, status: QuotationStatus) => {
    const { error } = await crmDb().from("quotations").update({ status }).eq("id", id);
    if (error) return toast.error("อัปเดตสถานะไม่สำเร็จ", { description: error.message });
    load();
  };

  const totalAccepted = rows
    .filter((r) => r.status === "accepted")
    .reduce((sum, r) => sum + (r.grand_total ?? 0), 0);

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">ใบเสนอราคา</h2>
          {rows.length > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px]">{rows.length}</Badge>
          )}
          {totalAccepted > 0 && (
            <span className="text-xs text-emerald-600 font-medium">
              อนุมัติ {formatBaht(totalAccepted)}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setFaOpen(true)}>
            <FileDown className="h-3.5 w-3.5" /> FA
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => { setEditTarget(null); setNewOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> สร้าง
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
          <FileText className="mx-auto mb-1.5 h-6 w-6 opacity-30" />
          ยังไม่มีใบเสนอราคา
        </div>
      ) : (
        <ul className="divide-y rounded-lg border overflow-hidden">
          {rows.map((r) => (
            <QuotationMiniRow
              key={r.id}
              row={r}
              onEdit={() => { setEditTarget(r); setNewOpen(true); }}
              onStatusChange={(s) => updateStatus(r.id, s)}
              canEdit={isManager || true}
            />
          ))}
        </ul>
      )}

      <QuotationFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        initial={editTarget}
        prefillLeadId={leadId}
        onSaved={() => { setNewOpen(false); setEditTarget(null); load(); }}
      />
      <FAImportToQuotationDialog
        open={faOpen}
        onOpenChange={setFaOpen}
        prefillLeadId={leadId}
        onImported={() => { setFaOpen(false); load(); }}
      />
    </section>
  );
}

function QuotationMiniRow({
  row, onEdit, onStatusChange,
}: {
  row: Quotation;
  onEdit: () => void;
  onStatusChange: (s: QuotationStatus) => void;
  canEdit: boolean;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const expired = row.valid_until && new Date(row.valid_until).getTime() < Date.now();

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-sm">
      {/* source badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
          row.source === "flowaccount"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
        }`}
      >
        {row.source === "flowaccount" ? "FA" : "CRM"}
      </span>

      {/* info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {row.quotation_no && (
            <span className="font-mono text-xs font-semibold text-muted-foreground">{row.quotation_no}</span>
          )}
          <span className="truncate text-xs">{row.title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{formatBaht(row.grand_total)}</span>
          {row.issued_date && <span>{formatThaiDate(row.issued_date)}</span>}
          {row.valid_until && (
            <span className={expired ? "text-red-500 font-medium" : ""}>
              ถึง {formatThaiDate(row.valid_until)}{expired ? " (หมดอายุ)" : ""}
            </span>
          )}
        </div>
      </div>

      {/* status dropdown */}
      <div className="relative shrink-0">
        <button
          onClick={() => setStatusOpen((v) => !v)}
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {statusOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 rounded-lg border bg-popover py-1 shadow-md min-w-[110px]">
              {(Object.keys(STATUS_LABEL) as QuotationStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusOpen(false); onStatusChange(s); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s].split(" ")[0]}`} />
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* FA external link */}
      {row.source === "flowaccount" && row.quotation_no && (
        <a
          href={`https://app.flowaccount.com/document/${row.quotation_no}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="ดูใน FlowAccount"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px]" onClick={onEdit}>
        แก้ไข
      </Button>
    </li>
  );
}
