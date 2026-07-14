/**
 * B2BConversationTab — แสดงการสนทนา (quote_messages) จาก B2B Platform
 * ดึงข้อมูลผ่าน b2b-quotes edge function เดิม
 * Pattern เดียวกับ B2BRequestsTab + LineRequestsTab
 */
import { useEffect, useState, useRef } from "react";
import {
  Loader2, RefreshCw, MessageSquare, Send, Building2,
  Phone, Mail, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, Clock, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import {
  fetchUnmatchedQuotes, fetchQuoteById,
  STATUS_LABEL, STATUS_COLOR, type B2BQuoteRequest,
} from "@/lib/b2b-client";
import { Pagination } from "./LineRequestsTab";

// ─── Types ─────────────────────────────────────────────────────────────────
interface B2BMessage {
  id: string;
  quote_request_id: string;
  sender_type: "customer" | "staff";
  sender_name: string;
  content: string;
  created_at: string;
  read_at: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
}

interface ConversationEntry {
  req: B2BQuoteRequest;
  messages: B2BMessage[];
  unread: number;
  lead_id?: string | null;
}

// ─── Config ─────────────────────────────────────────────────────────────────
const B2B_EDGE_URL = "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-quotes";
const B2B_SECRET   = "entgroup-crm-secret-2026";
const PAGE_SIZE    = 10;

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

// ─── Fetch messages from B2B edge function ──────────────────────────────────
async function fetchB2BMessages(quoteRequestId: string): Promise<B2BMessage[]> {
  try {
    const url = `${B2B_EDGE_URL}?messages=1&quote_request_id=${quoteRequestId}`;
    const res = await fetch(url, { headers: { "x-crm-secret": B2B_SECRET } });
    if (!res.ok) return [];
    const { data } = await res.json();
    return (data ?? []) as B2BMessage[];
  } catch {
    return [];
  }
}

// ─── Send reply back to B2B via edge function ───────────────────────────────
async function sendB2BReply(
  quoteRequestId: string,
  senderName: string,
  content: string
): Promise<boolean> {
  try {
    const res = await fetch(`${B2B_EDGE_URL}/messages`, {
      method: "POST",
      headers: {
        "x-crm-secret": B2B_SECRET,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        quote_request_id: quoteRequestId,
        sender_type: "staff",
        sender_name: senderName,
        content,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Also log reply as activity in CRM ─────────────────────────────────────
async function logReplyActivity(
  leadId: string,
  userId: string,
  senderName: string,
  content: string
) {
  await crmDb().from("activities").insert({
    lead_id: leadId,
    type: "note",
    subject: "ตอบกลับลูกค้า B2B",
    body: content,
    done: true,
    done_at: new Date().toISOString(),
    owner_id: userId,
  });
}

// ─── ChatBubble ─────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: B2BMessage }) {
  const isStaff = msg.sender_type === "staff";
  return (
    <div className={`flex ${isStaff ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${
        isStaff
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-muted text-foreground rounded-bl-sm"
      }`}>
        {!isStaff && (
          <p className="text-[11px] font-medium mb-0.5 opacity-60">{msg.sender_name}</p>
        )}
        <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        <p className={`text-[10px] mt-1 opacity-50 ${isStaff ? "text-right" : ""}`}>
          {fmtTime(msg.created_at)}
          {!isStaff && !msg.read_at && (
            <span className="ml-1 inline-block size-1.5 rounded-full bg-primary align-middle" />
          )}
        </p>
      </div>
    </div>
  );
}

// ─── ConversationPanel ──────────────────────────────────────────────────────
function ConversationPanel({
  entry,
  onClose,
  onSent,
}: {
  entry: ConversationEntry;
  onClose: () => void;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [reply, setReply]   = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { req, messages, lead_id } = entry;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);

    // User display name — fallback to email prefix
    const senderName =
      (user as any)?.user_metadata?.full_name ??
      (user?.email?.split("@")[0] ?? "Sales");

    const ok = await sendB2BReply(req.id, senderName, text);
    if (!ok) {
      toast.error("ส่งข้อความไม่สำเร็จ — edge function ยังไม่รองรับ POST /messages");
      // Still log in CRM if lead exists
    }

    // Log activity in CRM regardless (so team has record even if edge not deployed)
    if (lead_id && user?.id) {
      await logReplyActivity(lead_id, user.id, senderName, text);
    }

    if (ok) {
      toast.success("ส่งข้อความแล้ว");
      setReply("");
      onSent();
    } else {
      // Save draft locally so work isn't lost
      toast.warning("บันทึกใน CRM แล้ว แต่ยังส่งไม่ถึงลูกค้า — กรุณา deploy edge function");
      setReply("");
    }
    setSending(false);
  };

  const slaUrgent = req.sla_po_review_due &&
    new Date(req.sla_po_review_due).getTime() - Date.now() < 12 * 3600 * 1000;

  return (
    <div className="flex flex-col border border-border rounded-xl overflow-hidden bg-card" style={{ height: 520 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/20 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{req.customer_company || req.customer_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground"}`}>
              {STATUS_LABEL[req.status] ?? req.status}
            </span>
            {slaUrgent && (
              <span className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                <AlertTriangle className="size-3" /> SLA ด่วน
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {req.quote_number} · {req.customer_name}
            {req.customer_phone && ` · ${req.customer_phone}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-primary">{formatBaht(req.grand_total)}</span>
          {lead_id && (
            <a
              href={`/leads/${lead_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="ดู Lead ใน CRM"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="size-8 opacity-30" />
            <p className="text-sm">ยังไม่มีการสนทนา</p>
            <p className="text-xs opacity-60">พิมพ์เพื่อเริ่มบทสนทนากับลูกค้า</p>
          </div>
        ) : (
          <>
            {messages.map((m) => <ChatBubble key={m.id} msg={m} />)}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <div className="flex items-end gap-2 px-3 py-3 border-t shrink-0">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="พิมพ์ข้อความตอบกลับลูกค้า... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !reply.trim()}
          size="icon"
          className="shrink-0"
        >
          {sending
            ? <Loader2 className="size-4 animate-spin" />
            : <Send className="size-4" />
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Main Tab ───────────────────────────────────────────────────────────────
export function B2BConversationTab() {
  const [entries, setEntries]   = useState<ConversationEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(0);
  const [openEntry, setOpenEntry] = useState<ConversationEntry | null>(null);
  // collapsed rows in list (show only first row)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true); setError(null);
    try {
      // 1. Fetch all quote requests (same as B2BRequestsTab but include claimed ones)
      const url = `${B2B_EDGE_URL}?limit=100&include_claimed=1`;
      const res = await fetch(url, { headers: { "x-crm-secret": B2B_SECRET } });
      if (!res.ok) throw new Error(`B2B API error: ${res.status}`);
      const { data: allRequests, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);

      const reqs: B2BQuoteRequest[] = allRequests ?? [];

      // 2. For each request, fetch quote_messages
      //    (batch: fetch in parallel, cap at 20 to avoid timeout)
      const top20 = reqs.slice(0, 20);
      const withMessages = await Promise.all(
        top20.map(async (req) => {
          const messages = await fetchB2BMessages(req.id);
          const unread = messages.filter(
            (m) => m.sender_type === "customer" && !m.read_at
          ).length;
          return { req, messages, unread };
        })
      );

      // 3. Enrich with lead_id from CRM
      const b2bIds = top20.map((r) => r.id);
      let leadMap: Record<string, string> = {};
      if (b2bIds.length) {
        const { data: leads } = await crmDb()
          .from("leads")
          .select("id, b2b_request_id")
          .in("b2b_request_id", b2bIds);
        for (const l of (leads ?? []) as any[]) {
          if (l.b2b_request_id) leadMap[l.b2b_request_id] = l.id;
        }
      }

      const enriched: ConversationEntry[] = withMessages.map((w) => ({
        ...w,
        lead_id: leadMap[w.req.id] ?? null,
      }));

      // Sort: unread first, then by latest message
      enriched.sort((a, b) => {
        if (b.unread !== a.unread) return b.unread - a.unread;
        const aTime = a.messages.at(-1)?.created_at ?? a.req.created_at;
        const bTime = b.messages.at(-1)?.created_at ?? b.req.created_at;
        return bTime.localeCompare(aTime);
      });

      setEntries(enriched);
    } catch (e: any) {
      setError(e.message ?? "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.req.quote_number.toLowerCase().includes(q) ||
      e.req.customer_company.toLowerCase().includes(q) ||
      e.req.customer_name.toLowerCase().includes(q) ||
      e.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  });

  useEffect(() => { setPage(0); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalUnread = entries.reduce((s, e) => s + e.unread, 0);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const openConversation = (entry: ConversationEntry) => {
    setOpenEntry(entry);
    // optimistically clear unread
    setEntries((prev) =>
      prev.map((e) => e.req.id === entry.req.id ? { ...e, unread: 0 } : e)
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-background">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            การสนทนา B2B
            {totalUnread > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {totalUnread}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ข้อความจากลูกค้า B2B Platform — ตอบกลับได้จากหน้านี้โดยตรง
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Input
              placeholder="ค้นหาบริษัท / ข้อความ..."
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
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Open conversation panel */}
        {openEntry && (
          <ConversationPanel
            entry={openEntry}
            onClose={() => setOpenEntry(null)}
            onSent={load}
          />
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-600" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              หมายเหตุ: ฟีเจอร์นี้ต้องการ edge function รองรับ <code>?messages=1</code>
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={load}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> ลองใหม่
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">{search ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีการสนทนา"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border">
              {pageItems.map((entry) => {
                const { req, messages, unread, lead_id } = entry;
                const lastMsg = messages.at(-1);
                const isExpanded = expanded.has(req.id);
                const isOpen = openEntry?.req.id === req.id;

                return (
                  <div
                    key={req.id}
                    className={`transition-colors ${isOpen ? "bg-primary/5" : "hover:bg-muted/20"}`}
                  >
                    {/* Main row */}
                    <div className="flex items-start gap-3 px-5 py-4">
                      {/* Avatar */}
                      <div className={`size-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
                        unread > 0
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {req.customer_company?.[0]?.toUpperCase() ?? req.customer_name?.[0]?.toUpperCase() ?? "?"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-sm truncate ${unread > 0 ? "font-semibold" : "font-medium"}`}>
                              {req.customer_company || req.customer_name}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${STATUS_COLOR[req.status] ?? "bg-muted"}`}>
                              {STATUS_LABEL[req.status] ?? req.status}
                            </span>
                            {lead_id && (
                              <span title="มี Lead ใน CRM แล้ว" className="inline-flex">
                                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {unread > 0 && (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                {unread}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {lastMsg ? fmtDate(lastMsg.created_at) : fmtDate(req.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Last message preview */}
                        <p className={`text-xs mt-0.5 truncate ${
                          unread > 0 ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {lastMsg
                            ? `${lastMsg.sender_type === "staff" ? "คุณ: " : ""}${lastMsg.content}`
                            : `${req.quote_number} · ${formatBaht(req.grand_total)}`
                          }
                        </p>

                        {/* Sub info */}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span>{req.quote_number}</span>
                          <span className="font-medium text-primary">{formatBaht(req.grand_total)}</span>
                          {req.customer_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="size-3" />{req.customer_phone}
                            </span>
                          )}
                          {messages.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="size-3" />{messages.length} ข้อความ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {messages.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleExpand(req.id)}
                            title={isExpanded ? "ซ่อน" : "ดูข้อความล่าสุด"}
                          >
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />
                            }
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={isOpen ? "default" : "outline"}
                          className="h-7 px-2.5 text-xs gap-1"
                          onClick={() => isOpen ? setOpenEntry(null) : openConversation(entry)}
                        >
                          <MessageSquare className="h-3 w-3" />
                          {isOpen ? "ปิด" : "ตอบกลับ"}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded: recent messages preview */}
                    {isExpanded && messages.length > 0 && (
                      <div className="px-5 pb-4 border-t border-border/50 bg-muted/10">
                        <div className="pt-3 space-y-2 max-h-48 overflow-y-auto">
                          {messages.slice(-4).map((m) => (
                            <div key={m.id} className={`flex ${m.sender_type === "staff" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                                m.sender_type === "staff"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted"
                              }`}>
                                {m.sender_type === "customer" && (
                                  <span className="font-medium mr-1 opacity-60">{m.sender_name}:</span>
                                )}
                                {m.content}
                                <span className="ml-2 opacity-40">{fmtTime(m.created_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
