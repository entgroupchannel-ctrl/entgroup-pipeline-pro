import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, AlertTriangle, CheckCircle2, Clock, Calendar,
  ChevronDown, ChevronRight, Search, X, ExternalLink, Phone,
  Mail, MessageCircle, Users, FileText, CalendarDays, StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import {
  activityIcon, ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_COLOR,
  type Activity, type ActivityType,
} from "@/lib/activities";
import { ActivityLogDialog } from "@/components/activities/ActivityLogDialog";

export const Route = createFileRoute("/_authenticated/activities")({
  component: ActivitiesPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DAYS_TH   = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์"];

function todayTH() {
  const d = new Date();
  return `${DAYS_TH[d.getDay()]}ที่ ${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()+543}`;
}

function formatDue(iso: string, compact = false): string {
  const d = new Date(iso);
  const now = new Date();
  const sod = new Date(now); sod.setHours(0,0,0,0);
  const eod = new Date(now); eod.setHours(23,59,59,999);
  const tom = new Date(sod); tom.setDate(tom.getDate()+1);
  const hh = d.getHours().toString().padStart(2,"0");
  const mm = d.getMinutes().toString().padStart(2,"0");
  const t = `${hh}:${mm}`;
  if (d >= sod && d <= eod) return compact ? t : `วันนี้ ${t}`;
  if (d >= tom && d < new Date(tom.getTime()+86400000)) return compact ? `พรุ่ง ${t}` : `พรุ่งนี้ ${t}`;
  const daysAgo = Math.floor((sod.getTime()-d.getTime())/86400000);
  if (daysAgo === 1) return compact ? `เมื่อวาน` : `เมื่อวาน ${t}`;
  if (daysAgo > 1 && daysAgo < 30) return compact ? `-${daysAgo}ว` : `${daysAgo} วันที่แล้ว ${t}`;
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${t}`;
}

// ── Groups ────────────────────────────────────────────────────────────────────

interface Group { key:string; label:string; icon:React.ElementType|null; color:string; border:string; bg:string; items:Activity[]; collapsible?:boolean }

function buildGroups(items: Activity[]): Group[] {
  const now=new Date(), sod=new Date(now), eod=new Date(now), in3=new Date(now);
  sod.setHours(0,0,0,0); eod.setHours(23,59,59,999); in3.setDate(in3.getDate()+3); in3.setHours(23,59,59,999);
  const ov:Activity[]=[], td:Activity[]=[], up:Activity[]=[], lt:Activity[]=[], nd:Activity[]=[], dn:Activity[]=[];
  for (const a of items) {
    if (a.done) { dn.push(a); continue; }
    if (!a.due_at) { nd.push(a); continue; }
    const t=new Date(a.due_at);
    if (t<sod) ov.push(a);
    else if (t<=eod) td.push(a);
    else if (t<=in3) up.push(a);
    else lt.push(a);
  }
  const G:Group[]=[];
  if (ov.length) G.push({key:"overdue", label:"เลยกำหนด",    icon:AlertTriangle,  color:"#A32D2D",border:"border-l-red-500",   bg:"bg-red-50/30 dark:bg-red-950/10",  items:ov});
  if (td.length) G.push({key:"today",   label:"วันนี้",        icon:Clock,          color:"#854F0B",border:"border-l-amber-400", bg:"",                                  items:td});
  if (up.length) G.push({key:"upcoming",label:"3 วันข้างหน้า",icon:Calendar,       color:"#0C447C",border:"border-l-blue-400",  bg:"",                                  items:up});
  if (lt.length) G.push({key:"later",   label:"ถัดไป",         icon:null,           color:"#888780",border:"border-l-gray-300",  bg:"",                                  items:lt});
  if (nd.length) G.push({key:"nodate",  label:"ไม่มีกำหนด",   icon:null,           color:"#888780",border:"border-l-gray-300",  bg:"",                                  items:nd});
  if (dn.length) G.push({key:"done",    label:"เสร็จแล้ว",     icon:CheckCircle2,   color:"#3B6D11",border:"border-l-emerald-400",bg:"",                                 items:dn, collapsible:true});
  return G;
}

// ── Quick add form (inline at top of list) ────────────────────────────────────

function QuickAddForm({ onSaved, onClose }: { onSaved: ()=>void; onClose: ()=>void }) {
  const { user } = useAuth();
  const [type, setType] = useState<ActivityType>("call");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setHours(d.getHours()+1, 0, 0, 0);
    return d.toISOString().slice(0,16);
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!subject.trim()) { toast.error("กรุณาระบุหัวข้อ"); return; }
    setSaving(true);
    const { error } = await crmDb().from("activities").insert({
      lead_id: null,
      type,
      subject: subject.trim(),
      body: note.trim() || null,
      done: false,
      due_at: dueDate ? new Date(dueDate).toISOString() : null,
      owner_id: user?.id,
    });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ"); return; }
    toast.success("เพิ่มงานแล้ว");
    onSaved();
  };

  return (
    <div className="border-b bg-primary/5 px-6 py-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-primary">เพิ่มงาน / บันทึกกิจกรรม</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">ประเภท</Label>
          <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="call">📞 โทร</SelectItem>
              <SelectItem value="line">💬 Line</SelectItem>
              <SelectItem value="email">✉️ อีเมล</SelectItem>
              <SelectItem value="meeting">👥 ประชุม</SelectItem>
              <SelectItem value="note">📝 โน้ต</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">หัวข้อ *</Label>
          <Input
            autoFocus
            className="h-8 text-xs"
            placeholder="เช่น โทรติดตาม ลูกค้า ABC"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div>
          <Label className="text-xs">กำหนดเสร็จ</Label>
          <Input type="datetime-local" className="h-8 text-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-xs">หมายเหตุ (optional)</Label>
        <Textarea rows={2} className="text-xs resize-none" placeholder="บันทึกเพิ่มเติม..." value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>ยกเลิก</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          บันทึก
        </Button>
      </div>
    </div>
  );
}

// ── Activity detail modal ─────────────────────────────────────────────────────

function ActivityDetailModal({ a, leadsMap, profilesMap, onClose, onToggle, onNavigate }: {
  a: Activity;
  leadsMap: Map<string,string>;
  profilesMap: Map<string,string>;
  onClose: ()=>void;
  onToggle: (a:Activity, done:boolean)=>void;
  onNavigate: (leadId:string)=>void;
}) {
  const Icon = activityIcon(a.type);
  const typeCfg = ACTIVITY_TYPE_COLOR[a.type] ?? ACTIVITY_TYPE_COLOR["note"];
  const leadTitle = a.lead_id ? leadsMap.get(a.lead_id) : null;
  const ownerName = a.owner_id ? profilesMap.get(a.owner_id) : "—";

  // Parse body JSON
  let bodyData: Record<string,any> | null = null;
  let rawBody = a.body ?? "";
  if (a.body) { try { bodyData = JSON.parse(a.body); rawBody = ""; } catch {} }

  const fields: { label:string; value:string }[] = [];
  if (bodyData) {
    if (bodyData.topic)       fields.push({ label:"หัวข้อ", value:bodyData.topic });
    if (bodyData.issues)      fields.push({ label:"ประเด็น", value:bodyData.issues });
    if (bodyData.next_action) fields.push({ label:"Next action", value:bodyData.next_action });
    if (bodyData.next_date)   fields.push({ label:"นัดครั้งต่อไป", value:new Date(bodyData.next_date).toLocaleDateString("th-TH") });
    if (bodyData.result)      fields.push({ label:"ผล", value:bodyData.result });
    if (bodyData.opened)      fields.push({ label:"เปิดอ่าน", value:bodyData.opened === "yes" ? "ใช่" : bodyData.opened === "no" ? "ไม่" : "ไม่ทราบ" });
    if (bodyData.replied)     fields.push({ label:"ตอบกลับ", value:bodyData.replied === "yes" ? "ใช่" : "ไม่" });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${typeCfg.bg} ${typeCfg.text}`}>
              <Icon className="h-3.5 w-3.5" />
              {ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
            </span>
            <span className="text-base font-semibold truncate">{a.subject}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground mb-0.5">กำหนด</div>
              <div className="font-medium">{a.due_at ? formatDue(a.due_at, false) : "—"}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground mb-0.5">สถานะ</div>
              <div className="font-medium flex items-center gap-1">
                {a.done ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> เสร็จแล้ว</> : <><Clock className="h-3.5 w-3.5 text-amber-600" /> ยังไม่เสร็จ</>}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground mb-0.5">ผู้รับผิดชอบ</div>
              <div className="font-medium">{ownerName ?? "—"}</div>
            </div>
            {a.done_at && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-muted-foreground mb-0.5">เสร็จเมื่อ</div>
                <div className="font-medium">{formatDue(a.done_at, false)}</div>
              </div>
            )}
          </div>

          {/* Lead link */}
          {leadTitle && a.lead_id && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ดีลที่เกี่ยวข้อง</p>
              <button
                onClick={() => { onNavigate(a.lead_id!); onClose(); }}
                className="group flex w-full items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 hover:border-primary/40"
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary">{leadTitle}</p>
                  <p className="text-[10px] text-primary/60 mt-0.5 group-hover:text-primary/80">คลิกเพื่อดูรายละเอียดดีล →</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-primary/50 group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}

          {/* Structured body fields */}
          {fields.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">รายละเอียด</div>
              <div className="divide-y rounded-lg border bg-card overflow-hidden">
                {fields.map((f) => (
                  <div key={f.label} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                    <span className="text-muted-foreground w-24 shrink-0">{f.label}</span>
                    <span className="font-medium">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw body */}
          {rawBody && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground whitespace-pre-wrap">
              {rawBody}
            </div>
          )}

          {/* Action */}
          <div className="flex items-center justify-between border-t pt-3">
            <Button
              variant={a.done ? "outline" : "default"}
              size="sm"
              onClick={() => { onToggle(a, !a.done); onClose(); }}
            >
              {a.done ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "✓ ทำเครื่องหมายว่าเสร็จแล้ว"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>ปิด</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Stat card (matches leads/quotations PeriodKpiCard style) ─────────────────

function StatCard({ icon, value, label, tone }: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "red" | "amber" | "blue" | "emerald" | "muted";
}) {
  const toneClass = {
    red:      "text-red-600 dark:text-red-400",
    amber:    "text-amber-700 dark:text-amber-400",
    blue:     "text-blue-700 dark:text-blue-400",
    emerald:  "text-emerald-700 dark:text-emerald-400",
    muted:    "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={value > 0 ? toneClass : "text-muted-foreground"}>{icon}</span>
        {label}
      </div>
      <div className={`mt-1.5 text-lg font-bold tabular-nums ${value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

// ── Compact task row ─────────────────────────────────────────────────────────

function TaskRow({ a, group, leadsMap, profilesMap, onToggle, onClick }: {
  a: Activity;
  group: Group;
  leadsMap: Map<string,string>;
  profilesMap: Map<string,string>;
  onToggle: (a:Activity, done:boolean)=>void;
  onClick: (a:Activity)=>void;
}) {
  const Icon = activityIcon(a.type);
  const typeCfg = ACTIVITY_TYPE_COLOR[a.type] ?? ACTIVITY_TYPE_COLOR["note"];
  const leadTitle = a.lead_id ? leadsMap.get(a.lead_id) : null;
  const isOverdue = group.key === "overdue";
  const isToday   = group.key === "today";
  const isDone    = a.done;

  return (
    <li
      className={`flex items-center gap-2.5 px-4 py-2.5 border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/40 ${
        isDone ? "opacity-60" : ""
      }`}
      onClick={() => onClick(a)}
    >
      <div onClick={(e) => { e.stopPropagation(); onToggle(a, !isDone); }} className="shrink-0">
        <Checkbox checked={isDone} />
      </div>

      <span className={`inline-flex shrink-0 items-center justify-center h-6 w-6 rounded-full ${typeCfg.bg} ${typeCfg.text}`}>
        <Icon className="h-3 w-3" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-tight truncate ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {a.subject ?? ACTIVITY_TYPE_LABEL[a.type as ActivityType]}
        </p>
        {leadTitle && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{leadTitle}</p>}
      </div>

      {a.due_at && !isDone && (
        <span className={`shrink-0 text-xs tabular-nums whitespace-nowrap ${
          isOverdue ? "text-red-600 dark:text-red-400 font-medium" :
          isToday   ? "text-amber-700 dark:text-amber-400 font-medium" :
                      "text-muted-foreground"
        }`}>
          {formatDue(a.due_at, true)}
        </span>
      )}
    </li>
  );
}

// ── Column (one side of 2-col layout) ────────────────────────────────────────

function Column({ groups, leadsMap, profilesMap, onToggle, onClick, doneOpen, setDoneOpen }: {
  groups: Group[];
  leadsMap: Map<string,string>;
  profilesMap: Map<string,string>;
  onToggle: (a:Activity, done:boolean)=>void;
  onClick: (a:Activity)=>void;
  doneOpen: boolean;
  setDoneOpen: (v:boolean)=>void;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isCollapsible = group.collapsible;
        const isOpen = isCollapsible ? doneOpen : true;
        const SHOW = isCollapsible ? 3 : 6;
        const [showAll, setShowAll] = useState(false);
        const visible = showAll ? group.items : group.items.slice(0, SHOW);
        const hidden = group.items.length - visible.length;

        return (
          <div key={group.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              className="flex w-full items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
              onClick={() => isCollapsible && setDoneOpen(!isOpen)}
            >
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: group.color }} />
              {group.icon && <group.icon className="h-3.5 w-3.5 shrink-0" style={{ color: group.color }} />}
              <span className="text-xs font-semibold" style={{ color: group.color }}>{group.label}</span>
              <span className="text-[11px] text-muted-foreground">({group.items.length})</span>
              {isCollapsible && (
                <span className="ml-auto">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </span>
              )}
            </button>

            {isOpen && (
              <>
                <ul>
                  {visible.map((a) => (
                    <TaskRow key={a.id} a={a} group={group} leadsMap={leadsMap} profilesMap={profilesMap} onToggle={onToggle} onClick={onClick} />
                  ))}
                </ul>
                {hidden > 0 && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="flex w-full items-center justify-center gap-1 border-t bg-muted/20 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" /> อีก {hidden} รายการ
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

function ActivitiesPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isManager = role === "manager" || role === "admin";

  const [rows, setRows]           = useState<Activity[]|null>(null);
  const [leadsMap, setLeadsMap]   = useState<Map<string,string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string,string>>(new Map());
  const [logOpen, setLogOpen]     = useState(false);
  const [quickAdd, setQuickAdd]   = useState(false);
  const [search, setSearch]       = useState("");
  const [doneOpen, setDoneOpen]   = useState(false);
  const [selected, setSelected]   = useState<Activity|null>(null);

  const load = async () => {
    let q = crmDb().from("activities").select("*").order("due_at",{ascending:true,nullsFirst:false});
    if (!isManager && user) q = q.eq("owner_id", user.id);
    const [actRes, leadsRes, profRes] = await Promise.all([
      q,
      crmDb().from("leads").select("id,title,deal_number"),
      crmDb().from("user_profiles").select("id,full_name"),
    ]);
    if (actRes.error) { toast.error("โหลดไม่สำเร็จ"); return; }
    setRows((actRes.data??[]) as Activity[]);
    setLeadsMap(new Map((leadsRes.data??[]).map((l:any)=>[l.id, l.deal_number ?? l.title])));
    setProfilesMap(new Map((profRes.data??[]).map((p:any)=>[p.id,p.full_name??"?"])));
  };

  useEffect(()=>{ load(); }, [user?.id, isManager]);

  const toggleDone = async (a:Activity, done:boolean) => {
    setRows((prev)=>prev?.map((r)=>r.id===a.id?{...r,done,done_at:done?new Date().toISOString():null}:r)??null);
    const { error } = await crmDb().from("activities").update({done,done_at:done?new Date().toISOString():null}).eq("id",a.id);
    if (error) { toast.error("อัปเดตไม่สำเร็จ"); load(); }
    else if (done) toast.success("เสร็จแล้ว ✓",{duration:1500});
  };

  const filtered = useMemo(()=>{
    if (!rows) return null;
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((a)=>
      (a.subject??"").toLowerCase().includes(q) ||
      (a.lead_id?(leadsMap.get(a.lead_id)??""):"").toLowerCase().includes(q)
    );
  },[rows,search,leadsMap]);

  const groups = useMemo(()=>filtered?buildGroups(filtered):[], [filtered]);

  // Split groups into 2 columns: pending left, done + upcoming right
  const leftGroups  = groups.filter((g)=>!g.collapsible && ["overdue","today","nodate"].includes(g.key));
  const rightGroups = groups.filter((g)=>!leftGroups.includes(g));

  const counts = useMemo(()=>{
    if (!rows) return {overdue:0,today:0,upcoming:0,done:0};
    const now=new Date(),sod=new Date(now),eod=new Date(now),in3=new Date(now);
    sod.setHours(0,0,0,0); eod.setHours(23,59,59,999); in3.setDate(in3.getDate()+3); in3.setHours(23,59,59,999);
    return {
      overdue: rows.filter((a)=>!a.done&&a.due_at&&new Date(a.due_at)<sod).length,
      today:   rows.filter((a)=>!a.done&&a.due_at&&new Date(a.due_at)>=sod&&new Date(a.due_at)<=eod).length,
      upcoming:rows.filter((a)=>!a.done&&a.due_at&&new Date(a.due_at)>eod&&new Date(a.due_at)<=in3).length,
      done:    rows.filter((a)=>a.done).length,
    };
  },[rows]);

  if (!rows) return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 page-fade-in space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">งานวันนี้</h1>
          <p className="text-xs text-muted-foreground">{todayTH()}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=>{setQuickAdd((v)=>!v); setLogOpen(false);}}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มงาน
          </Button>
          <Button size="sm" onClick={()=>{setLogOpen(true); setQuickAdd(false);}}>
            <StickyNote className="mr-1.5 h-4 w-4" /> บันทึกกิจกรรม
          </Button>
        </div>
      </div>

      {/* KPI row (matches leads.index PeriodKpiCard grid) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} value={counts.overdue}  label="เลยกำหนด"     tone="red" />
        <StatCard icon={<Clock className="h-4 w-4" />}         value={counts.today}    label="วันนี้"        tone="amber" />
        <StatCard icon={<Calendar className="h-4 w-4" />}      value={counts.upcoming} label="3 วันข้างหน้า" tone="blue" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />}  value={counts.done}     label="เสร็จแล้ว"     tone="emerald" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="ค้นหา..." value={search} onChange={(e)=>setSearch(e.target.value)} className="pl-8 h-9 text-sm bg-background" />
      </div>

      {/* Quick add form */}
      {quickAdd && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <QuickAddForm onSaved={()=>{ setQuickAdd(false); load(); }} onClose={()=>setQuickAdd(false)} />
        </div>
      )}

      {/* ── 2-column content ── */}
      <div>
        {groups.length === 0 ? (

          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">ไม่มีงานค้าง 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: overdue + today + no-date */}
            <Column
              groups={leftGroups}
              leadsMap={leadsMap}
              profilesMap={profilesMap}
              onToggle={toggleDone}
              onClick={setSelected}
              doneOpen={doneOpen}
              setDoneOpen={setDoneOpen}
            />
            {/* Right: upcoming + later + done */}
            <Column
              groups={rightGroups}
              leadsMap={leadsMap}
              profilesMap={profilesMap}
              onToggle={toggleDone}
              onClick={setSelected}
              doneOpen={doneOpen}
              setDoneOpen={setDoneOpen}
            />
          </div>
        )}
      </div>

      {/* Activity log dialog (structured) */}
      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={null}
        onSaved={()=>{ setLogOpen(false); load(); }}
      />

      {/* Detail modal */}
      {selected && (
        <ActivityDetailModal
          a={selected}
          leadsMap={leadsMap}
          profilesMap={profilesMap}
          onClose={()=>setSelected(null)}
          onToggle={(a,done)=>{ toggleDone(a,done); setSelected(null); }}
          onNavigate={(leadId)=>{ navigate({to:"/leads/$leadId",params:{leadId}}); }}
        />
      )}
    </div>
  );
}
