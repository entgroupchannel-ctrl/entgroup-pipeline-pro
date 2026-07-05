import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Search,
  Plus,
  Phone,
  MessageCircle,
  Mail,
  FileText,
  Users,
  ChevronDown,
  FileDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// ActivityLogDialog handles its own imports
import { fetchFADocuments, type FADocument } from "@/lib/flowaccount-client";
import { ActivityLogDialog, type ActivityKind } from "@/components/activities/ActivityLogDialog";
import { AccountEmailDialog } from "@/components/accounts/AccountEmailDialog";



export const Route = createFileRoute("/_authenticated/key-accounts")({
  component: KeyAccountsPage,
});

interface KeyAccountTarget {
  visit_target: number;
  call_target: number;
  line_target: number;
  email_target: number;
  quote_target: number;
}

interface KeyAccount {
  id: string;
  name: string;
  industry: string | null;
  owner_id: string | null;
  is_key_account: boolean;
  leads?: {
    id: string;
    title: string;
    stage: string;
    expected_value: number | null;
    created_at: string;
    quotations: {
      id: string;
      quotation_no: string | null;
      title: string | null;
      grand_total: number | null;
      status: string | null;
      flowaccount_url: string | null;
    }[];

  }[];
  target?: KeyAccountTarget[];
}



interface ActivityRow {
  lead_id: string;
  type: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  subject: string;
  body: string | null;
}

const DEFAULT_TARGET: KeyAccountTarget = {
  visit_target: 1,
  call_target: 2,
  line_target: 3,
  email_target: 1,
  quote_target: 1,
};

const ACTIVITY_TYPES: {
  key: keyof KeyAccountTarget;
  type: string;
  label: string;
  icon: any;
}[] = [
  { key: "visit_target", type: "meeting", label: "เข้าพบ", icon: Users },
  { key: "call_target", type: "call", label: "โทร", icon: Phone },
  { key: "line_target", type: "line", label: "ข้อความ LINE", icon: MessageCircle },
  { key: "email_target", type: "email", label: "อีเมล", icon: Mail },
  { key: "quote_target", type: "note", label: "ใบเสนอราคา", icon: FileText },
];

function calcHealth(target: KeyAccountTarget, acts: ActivityRow[]): number {
  const count = (t: string) => acts.filter((a) => a.type === t).length;
  const scores = ACTIVITY_TYPES.map(({ key, type }) =>
    Math.min(count(type) / Math.max(target[key] || 1, 1), 1),
  );
  return Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100);
}

function KeyAccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<KeyAccount[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, string | null>>(new Map());
  const [profiles, setProfiles] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ทั้งหมด");
  const [selected, setSelected] = useState<KeyAccount | null>(null);
  const [tab, setTab] = useState("กิจกรรมเดือนนี้");
  const [logOpen, setLogOpen] = useState(false);
  const [logKind, setLogKind] = useState<ActivityKind>("call");
  const [logLeadId, setLogLeadId] = useState<string | null>(null);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [accPage, setAccPage] = useState(1);
  const ACC_PAGE_SIZE = 20;



  const load = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [accRes, profilesRes] = await Promise.all([
      crmDb()
        .from("accounts")
        .select(
          `id, name, industry, owner_id, is_key_account,
           leads (
             id, title, stage, expected_value, created_at,
             quotations ( id, quotation_no, title, grand_total, status, flowaccount_url )
           ),
           target:key_account_targets ( visit_target, call_target, line_target, email_target, quote_target )`,
        )
        .eq("is_key_account", true)
        .order("name"),
      crmDb().from("user_profiles").select("id, full_name"),
    ]);

    if (accRes.error) {
      toast.error("โหลด Key Accounts ไม่สำเร็จ: " + accRes.error?.message + " | " + accRes.error?.hint);
      return;
    }

    const profileMap = new Map<string, string | null>(
      (profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]),
    );
    setProfileMap(profileMap);
    setProfiles(profilesRes.data ?? []);

    const raw = (accRes.data ?? []) as any[];
    const accs: KeyAccount[] = raw.map((a) => ({
      ...a,
    }));


    const leadIds = accs.flatMap((a) => (a.leads ?? []).map((l) => l.id)).filter(Boolean);

    let acts: ActivityRow[] = [];
    if (leadIds.length) {
      const { data } = await crmDb()
        .from("activities")
        .select("lead_id, type, done, done_at, created_at, subject, body")
        .in("lead_id", leadIds)
        .gte("created_at", startOfMonth);
      acts = (data ?? []) as ActivityRow[];
    }

    setAccounts(accs);
    setActivities(acts);
    setSelected((prev) => {
      if (prev) return accs.find((a) => a.id === prev.id) ?? null;
      // Auto-select first account on initial load
      return accs[0] ?? null;
    });
  };



  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAccActivities = (acc: KeyAccount) => {
    const ids = new Set((acc.leads ?? []).map((l) => l.id));
    return activities.filter((a) => ids.has(a.lead_id));
  };

  const getAccLeads = (acc: KeyAccount) => (acc as any).leads ?? [];

  const filteredAccounts = useMemo(() => {

    const ql = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (ql && !a.name.toLowerCase().includes(ql)) return false;
      if (filter === "ทั้งหมด") return true;
      const target = a.target?.[0] ?? DEFAULT_TARGET;
      const health = calcHealth(target, getAccActivities(a));
      if (filter === "สุขภาพดี") return health >= 80;
      if (filter === "ต้องระวัง") return health >= 50 && health < 80;
      if (filter === "ใกล้สูญเสีย") return health < 50;
      return true;
    });
  }, [accounts, activities, q, filter]);

  useEffect(() => {
    setAccPage(1);
  }, [q, filter]);

  const accTotalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACC_PAGE_SIZE));
  const accPageSafe = Math.min(accPage, accTotalPages);
  const pagedAccounts = filteredAccounts.slice(
    (accPageSafe - 1) * ACC_PAGE_SIZE,
    accPageSafe * ACC_PAGE_SIZE,
  );

  const selectedActs = selected ? getAccActivities(selected) : [];
  const selectedTarget = selected?.target?.[0] ?? DEFAULT_TARGET;
  const selectedHealth = selected ? calcHealth(selectedTarget, selectedActs) : 0;

  const openLog = async (kind: ActivityKind) => {
    if (!selected) return;
    // resolve latest lead for this account
    const { data: lead } = await crmDb()
      .from("leads")
      .select("id")
      .eq("account_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lead) {
      toast.error("ไม่พบ Lead ของบริษัทนี้ กรุณาสร้างดีลก่อน");
      return;
    }
    setLogLeadId(lead.id);
    setLogKind(kind);
    setLogOpen(true);
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 3rem)", background: "var(--surface)" }}>
      {/* LEFT PANEL */}
      <div
        style={{
          width: 320,
          borderRight: "0.5px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-1)",
        }}
      >
        <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Crown size={16} color="#BA7517" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Key Accounts
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{accounts.length} บริษัท</div>
        </div>

        <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--border)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
            }}
          >
            <Search size={12} color="var(--text-muted)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา..."
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "var(--text-primary)",
                width: "100%",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            borderBottom: "0.5px solid var(--border)",
            overflowX: "auto",
          }}
        >
          {["ทั้งหมด", "ใกล้สูญเสีย", "ต้องระวัง", "สุขภาพดี"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 20,
                border: "0.5px solid var(--border)",
                background: filter === f ? "var(--text-primary)" : "transparent",
                color: filter === f ? "var(--surface-2)" : "var(--text-secondary)",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {pagedAccounts.map((acc) => {
            const target = acc.target?.[0] ?? DEFAULT_TARGET;
            const health = calcHealth(target, getAccActivities(acc));
            const dot = health >= 80 ? "#639922" : health >= 50 ? "#BA7517" : "#E24B4A";
            const initials = acc.name.slice(0, 2);
            return (
              <div
                key={acc.id}
                onClick={() => setSelected(acc)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: "0.5px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: selected?.id === acc.id ? "var(--surface-2)" : "transparent",
                  borderLeft:
                    selected?.id === acc.id ? "2px solid #185FA5" : "2px solid transparent",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {acc.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {acc.owner_id ? profileMap.get(acc.owner_id) ?? "—" : "—"}
                  </div>
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dot,
                    flexShrink: 0,
                  }}
                  title={`${health}%`}
                />
              </div>
            );
          })}
        </div>

        {accTotalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderTop: "0.5px solid var(--border)",
              fontSize: 11,
              color: "var(--text-muted)",
              gap: 8,
            }}
          >
            <span>
              {(accPageSafe - 1) * ACC_PAGE_SIZE + 1}–
              {Math.min(accPageSafe * ACC_PAGE_SIZE, filteredAccounts.length)} / {filteredAccounts.length}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setAccPage((p) => Math.max(1, p - 1))}
                disabled={accPageSafe <= 1}
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "0.5px solid var(--border)",
                  background: "transparent",
                  cursor: accPageSafe <= 1 ? "not-allowed" : "pointer",
                  opacity: accPageSafe <= 1 ? 0.4 : 1,
                }}
              >
                ก่อนหน้า
              </button>
              <span style={{ padding: "3px 8px" }}>
                {accPageSafe} / {accTotalPages}
              </span>
              <button
                onClick={() => setAccPage((p) => Math.min(accTotalPages, p + 1))}
                disabled={accPageSafe >= accTotalPages}
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "0.5px solid var(--border)",
                  background: "transparent",
                  cursor: accPageSafe >= accTotalPages ? "not-allowed" : "pointer",
                  opacity: accPageSafe >= accTotalPages ? 0.4 : 1,
                }}
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>


      {/* RIGHT PANEL */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── Header: ชื่อบริษัท + สถานะ ── */}
          <div className="border-b bg-card px-5 py-3.5 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground truncate">{selected.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selected.industry ?? "—"} · {selected.owner_id ? profileMap.get(selected.owner_id) ?? "—" : "—"}
                </p>
              </div>
              <span className={`shrink-0 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                selectedHealth >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" :
                selectedHealth >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
                "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              }`}>
                {selectedHealth >= 80 ? "✓ สุขภาพดี" : selectedHealth >= 50 ? "⚠ ต้องระวัง" : "⚡ ใกล้สูญเสีย"}
                {" "}{selectedHealth}%
              </span>
            </div>
          </div>

          {/* ── Quick Action Bar ── */}
          <div className="flex items-center gap-2 border-b bg-muted/10 px-5 py-2 shrink-0 overflow-x-auto">
            <button
              onClick={() => openLog("call")}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-600" /> โทร
            </button>
            <button
              onClick={() => openLog("line")}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <MessageCircle className="h-3.5 w-3.5 text-green-600" /> Line
            </button>
            <button
              onClick={() => setEmailOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <Mail className="h-3.5 w-3.5 text-blue-600" /> ส่งอีเมล
            </button>
            <button
              onClick={() => openLog("meeting")}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <Users className="h-3.5 w-3.5 text-violet-600" /> นัดประชุม
            </button>
            <button
              onClick={() => setAddDealOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <FileText className="h-3.5 w-3.5 text-amber-600" /> สร้างดีล
            </button>
            <div className="ml-auto shrink-0">
              <Button size="sm" onClick={() => openLog("call")}>
                <Plus className="mr-1 h-3.5 w-3.5" /> บันทึกกิจกรรม
              </Button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex border-b bg-card shrink-0 overflow-x-auto">
            {["กิจกรรมเดือนนี้", "ประวัติกิจกรรม", "ดีลที่เกี่ยวข้อง", "ผู้ติดต่อ", "อีเมล", "บันทึก"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {tab === "กิจกรรมเดือนนี้" && (
              <ActivityTab
                target={selectedTarget}
                acts={selectedActs}
                health={selectedHealth}
                onLog={(t) => openLog(t as ActivityKind)}
              />
            )}
            {tab === "ประวัติกิจกรรม" && (
              <ActivityHistoryTab accountId={selected.id} />
            )}
            {tab === "ดีลที่เกี่ยวข้อง" && (
              <DealsTab
                leads={getAccLeads(selected)}
                onAddDeal={() => setAddDealOpen(true)}
              />
            )}
            {tab === "ผู้ติดต่อ" && (
              <ContactsTab accountId={selected.id} accountName={selected.name} onEmail={() => setEmailOpen(true)} />
            )}
            {tab === "อีเมล" && (
              <EmailLogTab accountId={selected.id} />
            )}
            {tab === "บันทึก" && (
              <div className="text-sm text-muted-foreground">ยังไม่มีบันทึก</div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          <Crown className="h-8 w-8 opacity-20" />
          <span>เลือกบริษัทจากรายการด้านซ้าย</span>
        </div>
      )}

      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={logLeadId}
        defaultKind={logKind}
        title={selected ? `บันทึกกิจกรรม — ${selected.name}` : undefined}
        onSaved={() => { setLogOpen(false); load(); }}
      />

      {selected && (
        <AddDealDialog
          open={addDealOpen}
          onOpenChange={setAddDealOpen}
          account={selected}
          ownerId={user?.id ?? null}
          profiles={profiles}
          onCreated={() => { setAddDealOpen(false); load(); }}
        />
      )}

      {selected && emailOpen && (
        <AccountEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          accountId={selected.id}
          accountName={selected.name}
        />
      )}
    </div>
  );
}

function ActivityTab({
  target,
  acts,
  health,
  onLog,
}: {
  target: KeyAccountTarget;
  acts: ActivityRow[];
  health: number;
  onLog: (type: string) => void;
}) {
  const totalDone = acts.length;
  const totalTarget =
    target.visit_target +
    target.call_target +
    target.line_target +
    target.email_target +
    target.quote_target;
  const healthColor = health >= 80 ? "#639922" : health >= 50 ? "#BA7517" : "#E24B4A";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <SummaryCard label="สุขภาพลูกค้า" value={`${health}%`} color={healthColor} />
        <SummaryCard label="กิจกรรมทำแล้ว" value={String(totalDone)} />
        <SummaryCard label="เป้าเดือนนี้" value={String(totalTarget)} />
      </div>

      <div
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          background: "var(--surface-1)",
        }}
      >
        {ACTIVITY_TYPES.map(({ key, type, label, icon: Icon }, idx) => {
          const done = acts.filter((a) => a.type === type).length;
          const tgt = target[key] || 1;
          const pct = Math.min((done / tgt) * 100, 100);
          const barColor = pct >= 100 ? "#639922" : pct >= 50 ? "#185FA5" : "#BA7517";
          return (
            <div
              key={type}
              style={{
                padding: "12px 16px",
                borderTop: idx === 0 ? "none" : "0.5px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Icon size={16} color="var(--text-muted)" />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{label}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {done} / {tgt}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: "var(--surface-2)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: barColor,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onLog(type)}>
                <Plus className="mr-1 h-3 w-3" /> บันทึก
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DealsTab({ leads, onAddDeal }: { leads: any[]; onAddDeal: () => void }) {
  const STAGE_LABEL: Record<string, string> = {
    new: "ใหม่",
    qualified: "คัดกรอง",
    proposal: "เสนอราคา",
    negotiation: "เจรจา",
    closing: "ปิดขาย",
    won: "ชนะ",
    lost: "แพ้",
  };

  const STAGE_PCT: Record<string, number> = {
    new: 10,
    qualified: 25,
    proposal: 45,
    negotiation: 65,
    closing: 85,
    won: 100,
    lost: 0,
  };

  const STAGE_COLOR: Record<string, string> = {
    new: "#888780",
    qualified: "#378ADD",
    proposal: "#639922",
    negotiation: "#185FA5",
    closing: "#BA7517",
    won: "#3B6D11",
    lost: "#E24B4A",
  };

  const STATUS_LABEL: Record<string, string> = {
    draft: "ร่าง",
    sent: "ส่งแล้ว",
    accepted: "อนุมัติ",
    rejected: "ปฏิเสธ",
    cancelled: "ยกเลิก",
  };

  const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
    draft: { bg: "#F1EFE8", text: "#5F5E5A" },
    sent: { bg: "#E6F1FB", text: "#185FA5" },
    accepted: { bg: "#EAF3DE", text: "#27500A" },
    rejected: { bg: "#FCEBEB", text: "#A32D2D" },
    cancelled: { bg: "#F1EFE8", text: "#5F5E5A" },
  };

  const sortedLeads = useMemo(
    () =>
      [...leads].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      }),
    [leads],
  );

  const activeLeads = sortedLeads.filter((l) => l.stage !== "lost");
  const wonLeads = sortedLeads.filter((l) => l.stage === "won");

  const totalExpected = activeLeads.reduce(
    (s, l) => s + Number(l.expected_value ?? 0),
    0,
  );
  const totalWon = wonLeads.reduce(
    (s, l) => s + Number(l.expected_value ?? 0),
    0,
  );
  const allQTs = sortedLeads.flatMap((l) => l.quotations ?? []);
  const totalQT = allQTs.reduce((s, q) => s + Number(q.grand_total ?? 0), 0);

  const DEALS_PAGE_SIZE = 5;
  const [dealsPage, setDealsPage] = useState(1);
  const dealsTotalPages = Math.max(1, Math.ceil(sortedLeads.length / DEALS_PAGE_SIZE));
  const dealsPageSafe = Math.min(dealsPage, dealsTotalPages);
  const pagedLeads = sortedLeads.slice(
    (dealsPageSafe - 1) * DEALS_PAGE_SIZE,
    dealsPageSafe * DEALS_PAGE_SIZE,
  );

  const [expanded, setExpanded] = useState<Set<string>>(
    // เริ่มต้นเปิดเฉพาะดีลล่าสุด (ใหม่สุด) — ที่เหลือหุบไว้
    new Set(sortedLeads.slice(0, 1).map((l) => l.id)),
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "deals ทั้งหมด", value: String(leads.length), sub: "รายการ" },
          { label: "ใบเสนอราคา", value: String(allQTs.length), sub: "รายการ" },
          {
            label: "มูลค่าคาดหวัง",
            value: `฿${totalExpected.toLocaleString()}`,
            sub: "active deals",
            color: "#185FA5",
          },
          {
            label: "ชนะแล้ว",
            value: `฿${totalWon.toLocaleString()}`,
            sub: `${wonLeads.length} deal`,
            color: "#3B6D11",
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-lg bg-muted/40 p-3">
            <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
            <div className="text-lg font-medium" style={color ? { color } : {}}>
              {value}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          โอกาสขาย (Opportunities) · เรียงจากใหม่ไปเก่า
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(new Set(pagedLeads.map((l) => l.id)))}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            กางทั้งหมด
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            หุบทั้งหมด
          </button>
          <button
            onClick={onAddDeal}
            className="ml-2 flex items-center gap-1 text-xs border rounded px-2.5 py-1 hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> เพิ่มดีล
          </button>
        </div>
      </div>

      {/* Empty state */}
      {sortedLeads.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          ยังไม่มีดีลสำหรับ Account นี้
        </div>
      )}

      {/* Deal cards */}
      {pagedLeads.map((lead) => {
        const isOpen = expanded.has(lead.id);
        const qts: any[] = lead.quotations ?? [];
        const leadQtTotal = qts.reduce(
          (s: number, q: any) => s + Number(q.grand_total ?? 0),
          0,
        );
        const stageColor = STAGE_COLOR[lead.stage] ?? "#888780";
        const pct = STAGE_PCT[lead.stage] ?? 0;
        const isDone = lead.stage === "won" || lead.stage === "lost";

        return (
          <div
            key={lead.id}
            className="rounded-xl border bg-card overflow-hidden"
            style={{ opacity: isDone ? 0.75 : 1 }}
          >
            {/* Card header */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors border-b"
              onClick={() => toggle(lead.id)}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold shrink-0"
                style={{ background: `${stageColor}20`, color: stageColor }}
              >
                {(lead.title ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{lead.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {qts.length} ใบเสนอราคา
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium">
                  {lead.expected_value
                    ? `฿${Number(lead.expected_value).toLocaleString()}`
                    : "—"}
                </div>
                <span
                  className="inline-block text-[10px] px-2 py-0.5 rounded font-medium mt-1"
                  style={{ background: `${stageColor}20`, color: stageColor }}
                >
                  {STAGE_LABEL[lead.stage] ?? lead.stage}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>

            {/* Card body */}
            {isOpen && (
              <div className="px-4 pb-4">
                {/* Pipeline progress */}
                {lead.stage !== "lost" && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: stageColor }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                      {["ใหม่", "คัดกรอง", "เสนอราคา", "เจรจา", "ปิดขาย"].map((s) => (
                        <span key={s}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quotations section */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      ใบเสนอราคาในดีลนี้
                    </span>
                  </div>
                  {qts.length === 0 ? (
                    <div className="text-center py-3 text-xs text-muted-foreground border rounded-lg border-dashed">
                      ยังไม่มีใบเสนอราคา
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {qts.map((q: any) => {
                        const sc = STATUS_COLOR[q.status] ?? STATUS_COLOR.draft;
                        return (
                          <div
                            key={q.id}
                            className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2"
                          >
                            <span className="font-mono text-[11px] font-semibold text-muted-foreground min-w-[110px]">
                              {q.quotation_no ?? "—"}
                            </span>
                            <span className="text-xs text-muted-foreground flex-1 truncate">
                              {q.title ?? "—"}
                            </span>
                            <span className="text-xs font-medium min-w-[80px] text-right">
                              {q.grand_total
                                ? `฿${Number(q.grand_total).toLocaleString()}`
                                : "—"}
                            </span>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded min-w-[56px] text-center font-medium"
                              style={{ background: sc.bg, color: sc.text }}
                            >
                              {STATUS_LABEL[q.status] ?? q.status}
                            </span>
                            {q.flowaccount_url && (
                              <a
                                href={q.flowaccount_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-primary hover:underline shrink-0"
                              >
                                ดู
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Subtotal */}
                  {qts.length > 0 && (
                    <div className="flex justify-between items-center px-3 py-2 border-t mt-2">
                      <span className="text-[11px] text-muted-foreground">รวมในดีลนี้</span>
                      <span className="text-[13px] font-medium">
                        ฿{leadQtTotal.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {dealsTotalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          <span>
            แสดง {(dealsPageSafe - 1) * DEALS_PAGE_SIZE + 1}–
            {Math.min(dealsPageSafe * DEALS_PAGE_SIZE, sortedLeads.length)} จาก {sortedLeads.length} ดีล
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDealsPage((p) => Math.max(1, p - 1))}
              disabled={dealsPageSafe <= 1}
              className="px-2 py-1 border rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ก่อนหน้า
            </button>
            <span className="px-2">
              {dealsPageSafe} / {dealsTotalPages}
            </span>
            <button
              onClick={() => setDealsPage((p) => Math.min(dealsTotalPages, p + 1))}
              disabled={dealsPageSafe >= dealsTotalPages}
              className="px-2 py-1 border rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {/* Grand total */}
      {sortedLeads.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3">
          <div>
            <div className="text-[13px] text-muted-foreground">
              มูลค่ารวมทั้งหมด (จากใบเสนอราคา)
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              จาก {allQTs.length} ใบเสนอราคา ใน {sortedLeads.length} deals
            </div>
          </div>
          <div className="text-xl font-medium">฿{totalQT.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}


function AddDealDialog({
  open,
  onOpenChange,
  account,
  ownerId,
  profiles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: KeyAccount;
  ownerId: string | null;
  profiles: any[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    expected_value: "",
    expected_close_date: "",
    stage: "new",
    source: "key_account",
    flowaccount_quotation_no: "",
    owner_id: ownerId ?? "",
  });
  const [faDocs, setFaDocs] = useState<FADocument[]>([]);
  const [faLoading, setFaLoading] = useState(false);
  const [faQ, setFaQ] = useState("");
  const [faMode, setFaMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: "",
      expected_value: "",
      expected_close_date: "",
      stage: "new",
      source: "key_account",
      flowaccount_quotation_no: "",
      owner_id: ownerId ?? "",
    });
    setFaMode(false);
    setFaQ("");
  }, [open, ownerId]);

  const loadFA = async () => {
    setFaLoading(true);
    try {
      const docs = await fetchFADocuments();
      setFaDocs(
        docs.filter(
          (d) =>
            d.document_type === "quotation" &&
            (d.contact_name ?? "")
              .toLowerCase()
              .includes(account.name.toLowerCase().slice(0, 6)),
        ),
      );
    } catch {
      toast.error("โหลด FlowAccount ไม่สำเร็จ");
    } finally {
      setFaLoading(false);
    }
  };

  const pickFA = (doc: FADocument) => {
    setForm((f) => ({
      ...f,
      title: `${account.name} — ${doc.document_serial}`,
      expected_value: doc.grand_total != null ? String(doc.grand_total) : "",
      flowaccount_quotation_no: doc.document_serial,
      source: "flowaccount",
    }));
    setFaMode(false);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("กรุณาระบุชื่อดีล");
      return;
    }
    setSaving(true);
    const { error } = await crmDb().from("leads").insert({
      title: form.title.trim(),
      account_id: account.id,
      stage: form.stage,
      expected_value: form.expected_value ? Number(form.expected_value) : null,
      expected_close_date: form.expected_close_date || null,
      source: form.source || null,
      flowaccount_quotation_no: form.flowaccount_quotation_no || null,
      owner_id: form.owner_id || ownerId || null,
      created_by: ownerId,
    });
    setSaving(false);
    if (error) {
      toast.error("สร้างดีลไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success("สร้างดีลใหม่แล้ว");
    onCreated();
  };

  const STAGES = [
    { value: "new", label: "ใหม่" },
    { value: "qualified", label: "คัดกรอง" },
    { value: "proposal", label: "เสนอราคา" },
    { value: "negotiation", label: "เจรจา" },
    { value: "closing", label: "ปิดขาย" },
  ];

  const filteredFA = faDocs.filter(
    (d) =>
      !faQ ||
      (d.document_serial ?? "").toLowerCase().includes(faQ.toLowerCase()) ||
      (d.contact_name ?? "").toLowerCase().includes(faQ.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>เพิ่มดีลใหม่ — {account.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {/* FA import panel */}
          {faMode && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">เลือกจาก FlowAccount</span>
                <button
                  onClick={() => setFaMode(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาใบเสนอราคา..."
                  value={faQ}
                  onChange={(e) => setFaQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {faLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
                ) : filteredFA.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">ไม่พบเอกสาร</div>
                ) : (
                  filteredFA.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => pickFA(doc)}
                      className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left hover:bg-muted/50"
                    >
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        QT
                      </span>
                      <div className="flex-1">
                        <div className="text-xs font-medium">{doc.document_serial}</div>
                        <div className="text-[10px] text-muted-foreground">{doc.contact_name ?? "—"}</div>
                      </div>
                      <div className="text-xs font-medium">
                        {doc.grand_total != null
                          ? `฿${Number(doc.grand_total).toLocaleString()}`
                          : "—"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="flex flex-col gap-4">
            {/* Import FA button */}
            {!faMode && (
              <button
                onClick={() => {
                  setFaMode(true);
                  if (faDocs.length === 0) loadFA();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 py-2.5 text-xs text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              >
                <FileDown className="h-4 w-4" />
                นำเข้าจาก FlowAccount (ใบเสนอราคาของ {account.name})
              </button>
            )}

            {/* ชื่อดีล */}
            <div className="flex flex-col gap-1.5">
              <Label>ชื่อดีล *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="ระบุชื่อดีล"
              />
            </div>

            {/* Stage + Owner */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Stage เริ่มต้น</Label>
                <Select
                  value={form.stage}
                  onValueChange={(v) => setForm({ ...form, stage: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sales เจ้าของดีล</Label>
                <Select
                  value={form.owner_id || "none"}
                  onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    {profiles
                      .filter((p) => p.is_active !== false)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name ?? p.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* มูลค่า + วันปิด */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>มูลค่าคาดหวัง (บาท)</Label>
                <Input
                  type="number"
                  value={form.expected_value}
                  onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>วันที่คาดปิดดีล</Label>
                <Input
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                />
              </div>
            </div>

            {/* ที่มา + เลข QT */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>ที่มา</Label>
                <Select
                  value={form.source || "none"}
                  onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="key_account">Key Account</SelectItem>
                    <SelectItem value="flowaccount">FlowAccount</SelectItem>
                    <SelectItem value="line">LINE OA</SelectItem>
                    <SelectItem value="referral">แนะนำ</SelectItem>
                    <SelectItem value="website">เว็บไซต์</SelectItem>
                    <SelectItem value="other">อื่นๆ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>เลขที่ใบเสนอราคา FA</Label>
                <Input
                  value={form.flowaccount_quotation_no}
                  onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })}
                  placeholder="QT-XXXX"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Plus className="mr-1 h-4 w-4 animate-spin" />}
            สร้างดีล
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface-1)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: color ?? "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── ActivityHistoryTab ────────────────────────────────────────────────────────
function ActivityHistoryTab({ accountId }: { accountId: string }) {
  const [acts, setActs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Get all lead ids for this account
      const { data: leads } = await crmDb().from("leads").select("id").eq("account_id", accountId);
      const ids = (leads ?? []).map((l: any) => l.id);
      if (!ids.length) { setActs([]); setLoading(false); return; }
      const { data } = await crmDb()
        .from("activities")
        .select("id, type, subject, done, done_at, created_at, lead_id")
        .in("lead_id", ids)
        .order("created_at", { ascending: false })
        .limit(50);
      setActs(data ?? []);
      setLoading(false);
    })();
  }, [accountId]);

  const TYPE_ICON: Record<string, string> = { call:"📞", meeting:"👥", line:"💬", email:"✉️", note:"📝" };
  const MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()+543).slice(-2)}`;
  };

  if (loading) return <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!acts.length) return <p className="text-sm text-muted-foreground text-center py-10">ยังไม่มีประวัติกิจกรรม</p>;

  return (
    <div className="space-y-1">
      {acts.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted/20 transition-colors">
          <span className="text-base shrink-0 mt-0.5">{TYPE_ICON[a.type] ?? "📋"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{a.subject || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(a.created_at)}</p>
          </div>
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            a.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                   : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          }`}>
            {a.done ? "✓ เสร็จ" : "รอ"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── ContactsTab ───────────────────────────────────────────────────────────────
function ContactsTab({ accountId, accountName, onEmail }: { accountId: string; accountName: string; onEmail: () => void }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await crmDb()
        .from("contacts")
        .select("id, name, position, email, phone, line_id")
        .eq("account_id", accountId)
        .order("name");
      setContacts(data ?? []);
      setLoading(false);
    })();
  }, [accountId]);

  if (loading) return <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!contacts.length) return <p className="text-sm text-muted-foreground text-center py-10">ยังไม่มีผู้ติดต่อ</p>;

  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <div key={c.id} className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{c.name}</p>
              {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="rounded-lg border p-1.5 text-muted-foreground hover:text-primary hover:border-primary transition-colors" title={c.phone}>
                  <Phone className="h-3.5 w-3.5" />
                </a>
              )}
              {c.line_id && (
                <a href={`https://line.me/ti/p/~${c.line_id}`} target="_blank" rel="noreferrer" className="rounded-lg border p-1.5 text-muted-foreground hover:text-green-600 hover:border-green-400 transition-colors" title={`Line: ${c.line_id}`}>
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              )}
              {c.email && (
                <button onClick={onEmail} className="rounded-lg border p-1.5 text-muted-foreground hover:text-blue-600 hover:border-blue-400 transition-colors" title={c.email}>
                  <Mail className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            {c.email && <span className="truncate max-w-[200px]">{c.email}</span>}
            {c.phone && <span>{c.phone}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── EmailLogTab ───────────────────────────────────────────────────────────────
function EmailLogTab({ accountId }: { accountId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await crmDb()
        .from("email_send_log")
        .select("*")
        .or(`related_id.eq.${accountId},metadata->>account_id.eq.${accountId}`)
        .order("created_at", { ascending: false })
        .limit(30);
      setLogs(data ?? []);
      setLoading(false);
    })();
  }, [accountId]);

  const MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  if (loading) return <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!logs.length) return <p className="text-sm text-muted-foreground text-center py-10">ยังไม่มีประวัติการส่งอีเมล</p>;

  return (
    <div className="space-y-1.5">
      {logs.map((log) => (
        <div key={log.id} className="rounded-xl border bg-card px-4 py-3 hover:bg-muted/20 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium truncate flex-1">{log.subject || "—"}</p>
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              log.status === "sent"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            }`}>
              {log.status === "sent" ? "✓ ส่งแล้ว" : "✗ ล้มเหลว"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate">{log.recipient_name ? `${log.recipient_name} · ` : ""}{log.recipient_email}</span>
            <span className="shrink-0">{fmtDate(log.created_at)}</span>
          </div>
          {log.error_message && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">{log.error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
