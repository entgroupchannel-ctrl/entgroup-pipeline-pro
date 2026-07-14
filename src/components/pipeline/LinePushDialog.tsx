/**
 * LinePushDialog — ส่งข้อความ LINE จาก CRM โดยตรง
 * ใช้ LINE Push Message API + channel_access_token ที่ตั้งค่าไว้
 * ลูกค้าเห็นชื่อ OA เสมอ แต่ข้อความจะมี prefix ชื่อพนักงาน
 * Authorized by: therdpoom@entgroup.co.th
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageCircle, Send, X, Loader2, CheckCircle2,
  AlertTriangle, User, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { sendLinePush, getLeadLineUserId } from "@/lib/line-push.functions";

interface Props {
  leadId: string;
  leadTitle: string;
  onClose: () => void;
  onSent?: () => void;
}

const MAX_CHARS = 500; // LINE text message limit per bubble = 5000 แต่แนะนำสั้น

export function LinePushDialog({ leadId, leadTitle, onClose, onSent }: Props) {
  const { user } = useAuth();
  const doSend       = useServerFn(sendLinePush);
  const doGetLineUid = useServerFn(getLeadLineUserId);

  const senderName = (user as any)?.user_metadata?.full_name
    ?? user?.email?.split("@")[0]
    ?? "Sales";

  const [lineUserId,   setLineUserId]   = useState<string | null>(null);
  const [displayName,  setDisplayName]  = useState<string | null>(null);
  const [loadingUid,   setLoadingUid]   = useState(true);
  const [msg,          setMsg]          = useState("");
  const [showPrefix,   setShowPrefix]   = useState(true);
  const [sending,      setSending]      = useState(false);
  const [sent,         setSent]         = useState(false);

  // ── โหลด LINE user_id จาก lead ──────────────────────────────────────────
  useEffect(() => {
    setLoadingUid(true);
    doGetLineUid({ data: { lead_id: leadId } })
      .then((r: any) => {
        setLineUserId(r?.line_user_id ?? null);
        setDisplayName(r?.display_name ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingUid(false));
  }, [leadId]);

  // ── Preview text ────────────────────────────────────────────────────────
  const previewText = showPrefix ? `[${senderName}]: ${msg}` : msg;

  // ── Send ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!msg.trim() || !lineUserId || sending) return;
    setSending(true);
    try {
      await doSend({
        data: {
          line_user_id: lineUserId,
          message:      msg.trim(),
          lead_id:      leadId,
          show_sender:  showPrefix,
        },
      });
      setSent(true);
      toast.success("ส่งข้อความ LINE แล้ว");
      onSent?.();
      setTimeout(onClose, 1500);
    } catch (e: any) {
      toast.error("ส่งไม่สำเร็จ: " + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ background: "#06C755" }}>
          <MessageCircle className="size-5 text-white" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-white">ส่งข้อความ LINE โดยตรง</p>
            <p className="text-xs text-white/80 truncate">{leadTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── ตรวจสอบ LINE User ID ── */}
          {loadingUid ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              กำลังค้นหา LINE User ID...
            </div>
          ) : lineUserId ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  {displayName ?? "ลูกค้า"}
                </span>
                <span className="text-emerald-600/70 dark:text-emerald-400/70 ml-2 font-mono text-xs">
                  {lineUserId.slice(0, 10)}...
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300">ยังไม่มี LINE User ID</p>
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                    ลูกค้าต้องเคยส่งข้อความมาใน LINE OA ก่อน
                    หรือไปผูก contact → LINE UID ใน ตั้งค่า → LINE OA
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── แสดงชื่อผู้ส่ง ── */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">แสดงชื่อผู้ส่ง</p>
                <p className="text-xs text-muted-foreground">
                  ลูกค้าเห็น: <span className="font-mono font-medium">[{senderName}]: ...</span>
                </p>
              </div>
            </div>
            <Switch
              checked={showPrefix}
              onCheckedChange={setShowPrefix}
              id="show-prefix"
            />
          </div>

          {/* ── Compose ── */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">ข้อความ</label>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
              }}
              placeholder={`พิมพ์ข้อความถึง ${displayName ?? leadTitle}...`}
              rows={4}
              disabled={!lineUserId}
              autoFocus={!!lineUserId}
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Cmd+Enter ส่ง</span>
              <span className={msg.length > MAX_CHARS * 0.9 ? "text-amber-500" : ""}>
                {msg.length}/{MAX_CHARS}
              </span>
            </div>
          </div>

          {/* ── Preview ── */}
          {msg.trim() && (
            <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Eye className="size-3" /> ลูกค้าเห็น:
              </p>
              <p className="text-sm">
                {showPrefix && (
                  <span className="text-[#06C755] font-medium">[{senderName}]: </span>
                )}
                {msg}
              </p>
              <p className="text-[10px] text-muted-foreground">
                ส่งในนาม LINE OA — ลูกค้าไม่เห็นชื่อบัญชี LINE ส่วนตัว
              </p>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSend}
              disabled={!lineUserId || !msg.trim() || sending || sent}
              className="flex-1 gap-2"
              style={{ background: lineUserId && msg.trim() ? "#06C755" : undefined }}
            >
              {sent ? (
                <><CheckCircle2 className="size-4" /> ส่งแล้ว</>
              ) : sending ? (
                <><Loader2 className="size-4 animate-spin" /> กำลังส่ง...</>
              ) : (
                <><Send className="size-4" /> ส่งข้อความ LINE</>
              )}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={sending}>
              ยกเลิก
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
