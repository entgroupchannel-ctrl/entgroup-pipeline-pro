import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, MessageCircle, ChevronLeft, ChevronRight, ExternalLink, Plus, CheckCircle2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { crmDb, STAGE_LABEL_TH, type Lead, type LeadStage, type Account } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { useLineRealtime } from "@/hooks/useLineRealtime";
import { LinePushDialog } from "./LinePushDialog";

interface LineLead extends Lead {
  account?: Account | null;
  owner?: { id: string; full_name: string | null } | null;
}

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
}

const STAGE_DOT: Record<LeadStage, string> = {
  new: "bg-sky-500",
  qualified: "bg-blue-500",
  proposal: "bg-violet-500",
  negotiation: "bg-amber-500",
  closing: "bg-orange-500",
  won: "bg-emerald-500",
  lost: "bg-red-500",
};

const PAGE_SIZE = 10;

export function LineRequestsTab({ onLeadCreated }: { onLeadCreated?: () => void }) {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LineLead[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<"all" | "unclaimed" | "mine">("all");
  const [page, setPage] = useState(0);
  const [claiming,   setClaiming]   = useState<string | null>(null);
  const [replyLead,  setReplyLead]  = useState<LineLead | null>(null);
  const [contactMap, setContactMap] = useState<Record<string, { line_id: string|null; phone: string|null }>>({});
  const { unreadCounts } = useLineRealtime();

  const load = async () => {
    setLoading(true);
    const [leadsRes, accountsRes, profilesRes] = await Promise.all([
      crmDb().from("leads").select("*").eq("source", "line").order("updated_at", { ascending: false }),
      crmDb().from("accounts").select("id,name,industry"),
      crmDb().from("user_profiles").select("id,full_name,role"),
    ]);
    const accountsMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));
    const profilesMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const merged = (leadsRes.data ?? []).map((l: any) => ({
      ...l,
      account: l.account_id ? accountsMap.get(l.account_id) ?? null : null,
      owner: l.owner_id ? profilesMap.get(l.owner_id) ?? null : null,
    })) as LineLead[];
    setLeads(merged);

    // Load contact line_id + phone สำหรับ reply dialog
    const contactIds = merged.map((l) => l.contact_id).filter(Boolean) as string[];
    if (contactIds.length) {
      const { data: contacts } = await crmDb()
        .from("contacts").select("id, line_id, mobile_phone, office_phone")
        .in("id", contactIds);
      const cm: Record<string, { line_id: string|null; phone: string|null }> = {};
      for (const c of (contacts ?? []) as any[]) {
        cm[c.id] = { line_id: c.line_id ?? null, phone: c.mobile_phone ?? c.office_phone ?? null };
      }
      setContactMap(cm);
    }

    const ids = merged.map((l) => l.id);
    if (ids.length) {
      const { data } = await crmDb()
        .from("activities")
        .select("lead_id, body, created_at")
        .in("lead_id", ids)
        .eq("type", "line")
        .order("created_at", { ascending: false });
      const map: Record<string, string> = {};
      for (const a of (data ?? []) as any[]) {
        if (a.lead_id && !map[a.lead_id] && a.body) map[a.lead_id] = a.body;
      }
      setPreviews(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("line-requests-tab")
      .on("postgres_changes", { event: "*", schema: "crm", table: "leads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const counts = useMemo(() => ({
    all: leads.length,
    unclaimed: leads.filter((l) => !l.owner_id).length,
    mine: leads.filter((l) => l.owner_id === user?.id).length,
  }), [leads, user?.id]);

  const filtered = useMemo(() => {
    let list = leads;
    if (subFilter === "unclaimed") list = list.filter((l) => !l.owner_id);
    else if (subFilter === "mine") list = list.filter((l) => l.owner_id === user?.id);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        (l.title ?? "").toLowerCase().includes(q) ||
        (l.account?.name ?? "").toLowerCase().includes(q) ||
        (l.owner?.full_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [leads, subFilter, search, user?.id]);

  useEffect(() => { setPage(0); }, [subFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLeads = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const claim = async (lead: LineLead) => {
    setClaiming(lead.id);
    const { error } = await crmDb().from("leads").update({ owner_id: user?.id }).eq("id", lead.id);
    setClaiming(null);
    if (error) { toast.error("รับงานไม่สำเร็จ", { description: error.message }); return; }
    toast.success("รับงานแล้ว ✅");
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, owner_id: user?.id ?? null, owner: user ? { id: user.id, full_name: (user as any).user_metadata?.full_name ?? "ฉัน" } : null } : l)));
    onLeadCreated?.();
  };

  const getContact = (lead: LineLead) => lead.contact_id ? (contactMap[lead.contact_id] ?? null) : null;

  return (
    <div className="flex h-full flex-col">
      {replyLead && (
        <LinePushDialog
          leadId={replyLead.id}
          leadTitle={replyLead.account?.name ?? replyLead.title ?? "(ไม่มีชื่อ)"}
          onClose={() => setReplyLead(null)}
          onSent={() => { setReplyLead(null); load(); }}
        />
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-background">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            LINE Requests
            {!loading && leads.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#06C755]/10 px-1.5 text-[10px] font-bold text-[#06C755]">
                {leads.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">ดีลที่เข้ามาจาก LINE Official Account</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="ค้นหาชื่อ / บริษัท..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 pl-3 text-xs"
          />
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Sub-filter chips */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-6 py-2.5">
        {([
          ["all", "ทั้งหมด", counts.all],
          ["unclaimed", "รอรับงาน", counts.unclaimed],
          ["mine", "ของฉัน", counts.mine],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setSubFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              subFilter === key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            {label} <span className="ml-1 opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">{search ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีดีลจาก LINE"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-5 py-3 text-left font-normal w-28">วันที่</th>
                    <th className="px-5 py-3 text-left font-normal min-w-40">ดีล / ข้อความล่าสุด</th>
                    <th className="px-5 py-3 text-left font-normal w-44">บริษัท</th>
                    <th className="px-5 py-3 text-left font-normal w-40">ผู้ดูแล</th>
                    <th className="px-5 py-3 text-right font-normal w-32">มูลค่า</th>
                    <th className="px-5 py-3 text-left font-normal w-36">สถานะ</th>
                    <th className="px-4 py-3 w-36" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageLeads.map((lead) => {
                    const unread = unreadCounts[lead.id] ?? 0;
                    const preview = previews[lead.id];
                    const isMine = lead.owner_id === user?.id;
                    return (
                      <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                          {fmtDate(lead.updated_at)}
                        </td>
                        <td className="px-5 py-4 overflow-hidden">
                          <div className="flex items-center gap-2 min-w-0">
                            {unread > 0 && (
                              <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#06C755] animate-pulse" />
                            )}
                            <span className="font-medium truncate">{lead.title ?? "(ไม่มีชื่อ)"}</span>
                          </div>
                          {preview && (
                            <div className="text-xs text-muted-foreground truncate max-w-full mt-0.5">
                              {preview}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm truncate">{lead.account?.name ?? <span className="text-muted-foreground">—</span>}</div>
                          {lead.account?.industry && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">{lead.account.industry}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {lead.owner ? (
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isMine ? "bg-emerald-500" : "bg-slate-400"}`} />
                              <span className="truncate">{lead.owner.full_name ?? "—"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-amber-600">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                              รอรับงาน
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap tabular-nums">
                          {Number(lead.expected_value ?? 0) > 0
                            ? formatBaht(Number(lead.expected_value))
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-4 w-36">
                          <span className="inline-flex items-center gap-1.5 text-xs text-foreground w-full">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STAGE_DOT[lead.stage] ?? "bg-muted-foreground"}`} />
                            <span className="truncate">{STAGE_LABEL_TH[lead.stage] ?? lead.stage}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4 w-36">
                          <div className="inline-flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-[#06C755] hover:text-[#06C755] hover:bg-[#06C755]/10"
                              title="ตอบกลับทาง LINE"
                              onClick={() => setReplyLead(lead)}
                            >
                              <MessageSquarePlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="เปิดดีล">
                              <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            {!lead.owner_id ? (
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs gap-1"
                                onClick={() => claim(lead)}
                                disabled={claiming === lead.id}
                              >
                                {claiming === lead.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <><Plus className="h-3 w-3" /> รับงาน</>}
                              </Button>
                            ) : isMine ? (
                              <span className="inline-flex items-center gap-1 h-7 px-2.5 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> ของฉัน
                              </span>
                            ) : (
                              <span className="inline-flex items-center h-7 px-2.5 text-xs text-muted-foreground">
                                รับแล้ว
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Pagination({
  page, totalPages, total, pageSize, onChange,
}: {
  page: number; totalPages: number; total: number; pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
      <span>แสดง {from}–{to} จาก {total}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums px-2">{page + 1} / {totalPages}</span>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
