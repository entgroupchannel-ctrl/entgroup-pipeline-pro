/**
 * LineRequestsTab v2 — LINE Official style
 * 2-column: conversation list (left) | thread detail (right)
 * ชื่อลูกค้า + ข้อความรวมกันในแถวเดียว ไม่เปิด user ใหม่
 * Authorized by: therdpoom@entgroup.co.th
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, RefreshCw, MessageCircle, ExternalLink,
  Plus, CheckCircle2, MessageSquarePlus, Search,
  Phone, Mail, Building2, User, X,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { crmDb, STAGE_LABEL_TH, type Lead, type LeadStage, type Account } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useLineRealtime } from "@/hooks/useLineRealtime";
import { LinePushDialog } from "./LinePushDialog";
export { Pagination } from "./LineRequestsTabPagination";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LineLead extends Lead {
  account?: Account | null;
  owner?: { id: string; full_name: string | null } | null;
}
interface LineActivity {
  id: string;
  lead_id: string;
  body: string;
  created_at: string;
  subject?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MO = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtShort(iso: string) {
  const d = new Date(iso), n = new Date();
  const diff = Math.floor((n.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7) return `${diff}ว.`;
  return `${d.getDate()} ${MO[d.getMonth()]}`;
}
function fmtFull(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()+543} ${d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}`;
}

const STAGE_COLOR: Record<LeadStage, string> = {
  new: "bg-sky-500", qualified: "bg-blue-500", proposal: "bg-violet-500",
  negotiation: "bg-amber-500", closing: "bg-orange-500", won: "bg-emerald-500", lost: "bg-red-500",
};

function parseBody(body: string): string {
  try {
    const j = JSON.parse(body);
    return j?.sent_text ?? j?.message ?? j?.text ?? body;
  } catch { return body; }
}

// ─── Thread panel ─────────────────────────────────────────────────────────────
function ThreadPanel({
  lead, activities, loadingAct, onClaim, onReply, isMine, claiming, onClose, preview,
}: {
  lead: LineLead; activities: LineActivity[]; loadingAct: boolean;
  onClaim: () => void; onReply: () => void;
  isMine: boolean; claiming: boolean; onClose: () => void; preview?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities]);

  const rawName = lead.account?.name || lead.title || "";
  const isDefault = !rawName || rawName === "LINE Contacts" || rawName === "LINE Contact";
  const previewParsed = preview ? parseBody(preview) : "";
  const displayName = isDefault && previewParsed
    ? previewParsed.length > 20 ? previewParsed.slice(0, 20) + "…" : previewParsed
    : rawName || "(ไม่มีชื่อ)";

  return (
    <div className="flex flex-col bg-background" style={{ flex: 1, minWidth: 0, height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/5 shrink-0">
        <div className="size-9 rounded-full bg-[#06C755]/10 flex items-center justify-center font-semibold text-sm text-[#06C755] shrink-0">
          {displayName[0]?.toUpperCase() ?? "L"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{displayName}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
            {lead.owner ? (
              <span className="flex items-center gap-1">
                <User className="size-3" />{lead.owner.full_name ?? "—"}
              </span>
            ) : (
              <span className="text-amber-600 font-medium">ยังไม่มีผู้รับงาน</span>
            )}
            <span className={`flex items-center gap-1`}>
              <span className={`size-1.5 rounded-full ${STAGE_COLOR[lead.stage]}`}/>
              {STAGE_LABEL_TH[lead.stage] ?? lead.stage}
            </span>
            <span className="text-muted-foreground/60">{fmtShort(lead.updated_at)}</span>
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs gap-1.5 text-[#06C755] border-[#06C755]/30 hover:bg-[#06C755]/5"
            onClick={onReply}
          >
            <MessageSquarePlus className="size-3.5" />
            ส่ง LINE
          </Button>
          {!lead.owner_id && (
            <Button size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={onClaim} disabled={claiming}>
              {claiming ? <Loader2 className="size-3 animate-spin" /> : <><Plus className="size-3" />รับงาน</>}
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="เปิดดีล">
            <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
          <button type="button" onClick={onClose} className="md:hidden text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4" style={{ background: "#f7f7f7" }}>
        {loadingAct ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
            <MessageCircle className="size-10 opacity-20" />
            <p className="text-sm">ยังไม่มีข้อความที่บันทึกไว้</p>
            <p className="text-xs opacity-60">กด "ส่ง LINE" เพื่อส่งข้อความหาลูกค้า</p>
          </div>
        ) : (
          activities.map((a) => {
            const text = parseBody(a.body);
            const isMe = a.subject?.includes("ส่งข้อความ") || a.subject?.includes("staff");
            return (
              <div key={a.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className={`size-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-1 ${
                  isMe ? "bg-[#06C755] text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {isMe ? "S" : displayName[0]?.toUpperCase() ?? "L"}
                </div>
                <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                    isMe
                      ? "bg-[#06C755] text-white rounded-tr-sm"
                      : "bg-white text-foreground rounded-tl-sm shadow-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">{fmtFull(a.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose hint */}
      <div className="shrink-0 border-t bg-background px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onReply}
          className="flex-1 rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground text-left hover:bg-muted/60 transition-colors"
        >
          ส่งข้อความถึง {displayName}...
        </button>
        <button
          type="button"
          onClick={onReply}
          className="size-10 rounded-full bg-[#06C755] text-white flex items-center justify-center hover:bg-[#05b34d] transition-colors"
        >
          <MessageSquarePlus className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ─── ConvoRow ─────────────────────────────────────────────────────────────────
function ConvoRow({ lead, preview, unread, isActive, isMine, onClick }: {
  lead: LineLead; preview?: string; unread: number;
  isActive: boolean; isMine: boolean; onClick: () => void;
}) {
  const hasNew = unread > 0;
  const rawName = lead.account?.name || lead.title || "";
  const isDefault = !rawName || rawName === "LINE Contacts" || rawName === "LINE Contact";
  const previewText = preview ? parseBody(preview) : "";
  const displayName = isDefault && previewText
    ? previewText.length > 22 ? previewText.slice(0, 22) + "…" : previewText
    : rawName || "(ไม่มีชื่อ)";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-border/30 transition-colors ${
        isActive ? "bg-[#06C755]/5 border-l-[3px] border-l-[#06C755]" : "hover:bg-muted/30"
      }`}
    >
      {/* Avatar */}
      <div className={`size-11 rounded-full flex-shrink-0 flex items-center justify-center font-semibold ${
        hasNew ? "bg-[#06C755] text-white" : "bg-[#06C755]/10 text-[#06C755]"
      }`}>
        {displayName[0]?.toUpperCase() ?? "L"}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-sm truncate ${hasNew ? "font-bold" : "font-medium"}`}>
            {displayName}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">{fmtShort(lead.updated_at)}</span>
        </div>
        {/* preview message */}
        <p className={`text-xs truncate mt-0.5 ${hasNew ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          {preview ? parseBody(preview) : (
            lead.owner_id
              ? `ผู้ดูแล: ${lead.owner?.full_name ?? "—"}`
              : "รอรับงาน"
          )}
        </p>
        {/* status dot */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`size-1.5 rounded-full ${STAGE_COLOR[lead.stage]}`}/>
          <span className="text-[10px] text-muted-foreground">{STAGE_LABEL_TH[lead.stage]}</span>
          {!lead.owner_id && (
            <span className="text-[10px] text-amber-600 font-medium ml-1">• รอรับงาน</span>
          )}
        </div>
      </div>

      {/* Unread */}
      {hasNew && (
        <span className="size-5 rounded-full bg-[#06C755] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LineRequestsTab({ onLeadCreated }: { onLeadCreated?: () => void }) {
  const { user } = useAuth();
  const [leads, setLeads]         = useState<LineLead[]>([]);
  const [previews, setPreviews]   = useState<Record<string, string>>({});
  const [activities, setActs]     = useState<LineActivity[]>([]);
  const [loadingAct, setLoadAct]  = useState(false);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [subFilter, setSubFilter] = useState<"all" | "unclaimed" | "mine">("all");
  const [selected, setSelected]   = useState<LineLead | null>(null);
  const [claiming, setClaiming]   = useState(false);
  const [replyLead, setReplyLead] = useState<LineLead | null>(null);
  const { unreadCounts, clearBadge } = useLineRealtime();

  // ── Load leads ──────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [leadsRes, accountsRes, profilesRes] = await Promise.all([
      crmDb().from("leads").select("*").eq("source", "line").order("updated_at", { ascending: false }),
      crmDb().from("accounts").select("id,name,industry"),
      crmDb().from("user_profiles").select("id,full_name,role"),
    ]);
    const aMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));
    const pMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const merged = (leadsRes.data ?? []).map((l: any) => ({
      ...l,
      account: l.account_id ? aMap.get(l.account_id) ?? null : null,
      owner:   l.owner_id   ? pMap.get(l.owner_id)   ?? null : null,
    })) as LineLead[];
    setLeads(merged);

    // load last message preview per lead
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

  // ── Load thread activities ───────────────────────────────────────────────────
  const loadThread = async (leadId: string) => {
    setLoadAct(true);
    const { data } = await crmDb()
      .from("activities")
      .select("id, lead_id, body, subject, created_at")
      .eq("lead_id", leadId)
      .eq("type", "line")
      .order("created_at", { ascending: true });
    setActs((data ?? []) as LineActivity[]);
    setLoadAct(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase
      .channel("line-requests-tab")
      .on("postgres_changes", { event: "*", schema: "crm", table: "leads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const onSelect = (lead: LineLead) => {
    setSelected(lead);
    loadThread(lead.id);
    clearBadge(lead.id);
  };

  // ── Claim ───────────────────────────────────────────────────────────────────
  const claim = async () => {
    if (!selected) return;
    setClaiming(true);
    const { error } = await crmDb().from("leads").update({ owner_id: user?.id }).eq("id", selected.id);
    setClaiming(false);
    if (error) { toast.error("รับงานไม่สำเร็จ"); return; }
    toast.success("รับงานแล้ว ✅");
    setLeads((prev) => prev.map((l) => l.id === selected.id
      ? { ...l, owner_id: user?.id ?? null, owner: user ? { id: user.id, full_name: (user as any).user_metadata?.full_name ?? "ฉัน" } : null }
      : l));
    setSelected((s) => s ? { ...s, owner_id: user?.id ?? null } : s);
    onLeadCreated?.();
  };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all:       leads.length,
    unclaimed: leads.filter((l) => !l.owner_id).length,
    mine:      leads.filter((l) => l.owner_id === user?.id).length,
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
        (l.owner?.full_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [leads, subFilter, search, user?.id]);

  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>

      {/* Push dialog */}
      {replyLead && (
        <LinePushDialog
          leadId={replyLead.id}
          leadTitle={replyLead.account?.name ?? replyLead.title ?? "(ไม่มีชื่อ)"}
          onClose={() => setReplyLead(null)}
          onSent={() => { setReplyLead(null); if (selected?.id === replyLead.id) loadThread(replyLead.id); load(); }}
        />
      )}

      {/* Body: 2 column */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* ── Left: conversation list ── */}
        <div style={{
          width: 340, minWidth: 280, display: "flex", flexDirection: "column",
          height: "100%", overflow: "hidden", borderRight: "1px solid var(--border)",
        }}>
          {/* Search + filter */}
          <div className="px-3 py-2.5 border-b bg-background space-y-2 shrink-0">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา..."
                className="flex-1 bg-transparent text-xs focus:outline-none"
              />
              {totalUnread > 0 && (
                <span className="size-5 rounded-full bg-[#06C755] text-white text-[10px] font-bold flex items-center justify-center">
                  {totalUnread}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              {([ ["all","ทั้งหมด",counts.all], ["unclaimed","รอรับงาน",counts.unclaimed], ["mine","ของฉัน",counts.mine] ] as const).map(([k,l,c]) => (
                <button key={k} type="button" onClick={() => setSubFilter(k)}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-medium transition-colors ${
                    subFilter===k ? "bg-[#06C755] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {l} ({c})
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                <MessageCircle className="size-8 opacity-20" />
                <p className="text-xs">{search ? "ไม่พบ" : "ยังไม่มีดีลจาก LINE"}</p>
              </div>
            ) : filtered.map((lead) => (
              <ConvoRow
                key={lead.id}
                lead={lead}
                preview={previews[lead.id]}
                unread={unreadCounts[lead.id] ?? 0}
                isActive={selected?.id === lead.id}
                isMine={lead.owner_id === user?.id}
                onClick={() => onSelect(lead)}
              />
            ))}
          </div>
        </div>

        {/* ── Right: thread or empty ── */}
        {selected ? (
          <ThreadPanel
            lead={selected}
            activities={activities}
            loadingAct={loadingAct}
            onClaim={claim}
            onReply={() => setReplyLead(selected)}
            isMine={selected.owner_id === user?.id}
            claiming={claiming}
            onClose={() => setSelected(null)}
            preview={previews[selected.id]}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3" style={{ background: "#f7f7f7" }}>
            <MessageCircle className="size-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium text-sm">เลือกการสนทนาจากรายการด้านซ้าย</p>
              <p className="text-xs opacity-60 mt-1">หรือรอข้อความใหม่จากลูกค้า</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
