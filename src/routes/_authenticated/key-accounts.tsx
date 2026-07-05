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
  owner?: { full_name: string | null } | null;
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
      flowaccount_quotation_url: string | null;
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
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ทั้งหมด");
  const [selected, setSelected] = useState<KeyAccount | null>(null);
  const [tab, setTab] = useState("กิจกรรมเดือนนี้");
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState("meeting");
  const [logNote, setLogNote] = useState("");

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
             quotations ( id, quotation_no, title, grand_total, status, flowaccount_quotation_url )
           ),
           target:key_account_targets ( visit_target, call_target, line_target, email_target, quote_target )`,
        )
        .eq("is_key_account", true)
        .order("name"),
      crmDb().from("user_profiles").select("id, full_name"),
    ]);


    if (accRes.error) {
      toast.error("โหลด Key Accounts ไม่สำเร็จ");
      return;
    }

    const profileMap = new Map<string, string | null>(
      (profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]),
    );
    const raw = (accRes.data ?? []) as any[];
    const accs: KeyAccount[] = raw.map((a) => ({
      ...a,
      owner: a.owner_id ? { full_name: profileMap.get(a.owner_id) ?? null } : null,
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
    setSelected((prev) => (prev ? accs.find((a) => a.id === prev.id) ?? null : null));
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

  const selectedActs = selected ? getAccActivities(selected) : [];
  const selectedTarget = selected?.target?.[0] ?? DEFAULT_TARGET;
  const selectedHealth = selected ? calcHealth(selectedTarget, selectedActs) : 0;

  const handleLog = async () => {
    if (!selected) return;
    const { data: lead } = await crmDb()
      .from("leads")
      .select("id")
      .eq("account_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lead) {
      toast.error("ไม่พบ Lead ของบริษัทนี้");
      return;
    }
    const { error } = await crmDb().from("activities").insert({
      lead_id: lead.id,
      type: logType,
      subject: `Key Account: ${logType}`,
      body: logNote || null,
      done: true,
      done_at: new Date().toISOString(),
      owner_id: user?.id,
    });
    if (error) {
      toast.error("บันทึกไม่สำเร็จ");
      return;
    }
    toast.success("บันทึกกิจกรรมแล้ว");
    setLogOpen(false);
    setLogNote("");
    load();
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
          {filteredAccounts.map((acc) => {
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
                    {acc.owner?.full_name ?? "—"}
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
      </div>

      {/* RIGHT PANEL */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ borderBottom: "0.5px solid var(--border)", background: "var(--surface-1)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "16px 20px 8px",
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {selected.industry ?? "—"} · {selected.owner?.full_name ?? "—"}
                </div>
              </div>
              <Button size="sm" onClick={() => setLogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> บันทึกกิจกรรม
              </Button>
            </div>

            <div style={{ display: "flex", gap: 4, padding: "0 20px", overflowX: "auto" }}>
              {["กิจกรรมเดือนนี้", "ประวัติกิจกรรม", "ดีลที่เกี่ยวข้อง", "บันทึก"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    fontSize: 12,
                    padding: "8px 16px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    borderBottom:
                      tab === t ? "2px solid #185FA5" : "2px solid transparent",
                    color: tab === t ? "#185FA5" : "var(--text-muted)",
                    fontWeight: tab === t ? 500 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {tab === "กิจกรรมเดือนนี้" && (
              <ActivityTab
                target={selectedTarget}
                acts={selectedActs}
                health={selectedHealth}
                onLog={(t) => {
                  setLogType(t);
                  setLogOpen(true);
                }}
              />
            )}
            {tab === "ประวัติกิจกรรม" && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ประวัติกิจกรรมทั้งหมดจะแสดงที่นี่
              </div>
            )}
            {tab === "ดีลที่เกี่ยวข้อง" && (
              <DealsTab
                account={selected}
                leads={getAccLeads(selected)}
                onAddDeal={() => {/* navigate to pipeline */}}
              />
            )}

            {tab === "บันทึก" && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ยังไม่มีบันทึก</div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          เลือกบริษัทจากรายการด้านซ้าย
        </div>
      )}

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>บันทึกกิจกรรม</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Label>ประเภท</Label>
              <select
                value={logType}
                onChange={(e) => setLogType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 13,
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                }}
              >
                {ACTIVITY_TYPES.map((a) => (
                  <option key={a.type} value={a.type}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>บันทึก</Label>
              <Textarea
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="สรุปกิจกรรม..."
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => setLogOpen(false)}>
                ยกเลิก
              </Button>
              <Button onClick={handleLog}>บันทึก</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
