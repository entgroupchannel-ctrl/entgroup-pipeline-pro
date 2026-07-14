/**
 * LineReplyDialog — ช่อง compose สำหรับ LINE
 * เนื่องจาก LINE OA ไม่มี deep-link เปิด conversation จาก external ได้โดยตรง
 * แนวทางที่ใช้:
 *  1. พิมพ์ข้อความใน CRM
 *  2. กด "Copy & Open LINE Chat" → copy ข้อความ + เปิด chat.line.biz
 *  3. Paste ลงใน LINE OA Chat Manager
 *  4. บันทึก activity log ใน CRM ด้วย (optional)
 *
 * Authorized by: therdpoom@entgroup.co.th
 */
import { useState } from "react";
import {
  MessageCircle, Copy, CheckCheck, ExternalLink,
  X, Clipboard, ClipboardCheck, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { crmDb } from "@/lib/crm";

interface Props {
  leadId: string;
  leadTitle: string;
  contactName?: string | null;
  contactLineId?: string | null;   // Uxxxxxxxx — ใช้ค้นหาใน LINE Chat
  contactPhone?: string | null;
  onClose: () => void;
  onLogged?: () => void;
}

const LINE_CHAT_URL = "https://chat.line.biz";

export function LineReplyDialog({
  leadId, leadTitle, contactName, contactLineId, contactPhone, onClose, onLogged,
}: Props) {
  const { user } = useAuth();
  const [msg,      setMsg]      = useState("");
  const [copied,   setCopied]   = useState(false);
  const [logging,  setLogging]  = useState(false);
  const [logged,   setLogged]   = useState(false);

  const displayName = contactName ?? leadTitle;

  // ── Copy ──────────────────────────────────────────────────────────────────
  const copyMsg = async () => {
    if (!msg.trim()) { toast.warning("พิมพ์ข้อความก่อนคัดลอก"); return; }
    await navigator.clipboard.writeText(msg.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Copy + Open LINE Chat ─────────────────────────────────────────────────
  const copyAndOpen = async () => {
    if (!msg.trim()) { toast.warning("พิมพ์ข้อความก่อน"); return; }
    // 1. copy
    await navigator.clipboard.writeText(msg.trim());
    toast.success("คัดลอกข้อความแล้ว — วาง (Cmd+V) ใน LINE Chat ได้เลย");
    // 2. open LINE Chat with search pre-filled if we have line_id
    const target = contactLineId
      ? `${LINE_CHAT_URL}/?q=${encodeURIComponent(contactLineId)}`
      : `${LINE_CHAT_URL}/`;
    window.open(target, "_blank", "noopener");
    setCopied(true);
  };

  // ── Log activity ──────────────────────────────────────────────────────────
  const logActivity = async () => {
    if (!msg.trim()) { toast.warning("พิมพ์ข้อความก่อน"); return; }
    setLogging(true);
    try {
      const now = new Date().toISOString();
      await crmDb().from("activities").insert({
        lead_id:      leadId,
        type:         "line",
        subject:      `ส่งข้อความ LINE: ${displayName}`,
        body:         msg.trim(),
        done:         true,
        done_at:      now,
        owner_id:     user?.id,
        // fields ที่ ActivityLogDialog ใช้
        kind:         "line",
        message_type: "text",
        read_status:  "sent",
      });
      setLogged(true);
      toast.success("บันทึก activity แล้ว");
      onLogged?.();
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
      setLogging(false);
    }
  };

  return (
    // faux viewport สำหรับ dialog (ไม่ใช้ position:fixed)
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-[#06C755]/5">
          <div className="size-9 rounded-full bg-[#06C755] flex items-center justify-center">
            <MessageCircle className="size-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">ตอบกลับทาง LINE</p>
            <p className="text-xs text-muted-foreground truncate">{displayName}</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Contact info ── */}
          {(contactLineId || contactPhone) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {contactLineId && (
                <span className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5">
                  <MessageCircle className="size-3 text-[#06C755]" />
                  LINE ID: <span className="font-mono">{contactLineId}</span>
                </span>
              )}
              {contactPhone && (
                <span className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5">
                  <Phone className="size-3" />
                  {contactPhone}
                </span>
              )}
            </div>
          )}

          {/* ── Compose ── */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">ข้อความ</label>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder={`พิมพ์ข้อความถึง ${displayName}...`}
              rows={5}
              autoFocus
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]/40 transition"
            />
            <p className="text-[11px] text-muted-foreground text-right">{msg.length} ตัวอักษร</p>
          </div>

          {/* ── How it works ── */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">วิธีใช้งาน</p>
            <div className="space-y-1.5">
              {[
                { step: "1", text: "พิมพ์ข้อความด้านบน" },
                { step: "2", text: 'กด "Copy & เปิด LINE" → ระบบ copy ข้อความ + เปิด LINE OA Chat' },
                { step: "3", text: `ใน LINE Chat ค้นหา "${contactLineId ?? displayName}" แล้ว Paste (Cmd+V / Ctrl+V) ส่ง` },
                { step: "4", text: "กด \"บันทึกใน CRM\" เพื่อเก็บ activity log" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {step}
                  </span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex flex-col gap-2">
            {/* Primary: Copy + Open */}
            <button
              type="button"
              onClick={copyAndOpen}
              disabled={!msg.trim()}
              className={`flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold transition ${
                msg.trim()
                  ? "bg-[#06C755] hover:bg-[#05b34d] text-white"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {copied
                ? <><ClipboardCheck className="size-4"/> คัดลอกแล้ว — LINE Chat กำลังเปิด</>
                : <><ExternalLink className="size-4"/> Copy & เปิด LINE Chat</>
              }
            </button>

            {/* Secondary row */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5"
                onClick={copyMsg} disabled={!msg.trim()}>
                {copied ? <CheckCheck className="size-3.5"/> : <Copy className="size-3.5"/>}
                {copied ? "คัดลอกแล้ว" : "Copy เฉพาะข้อความ"}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5"
                onClick={logActivity} disabled={!msg.trim() || logging || logged}>
                {logged
                  ? <><CheckCheck className="size-3.5 text-emerald-500"/> บันทึกแล้ว</>
                  : logging
                  ? <><span className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"/> กำลังบันทึก</>
                  : <><Clipboard className="size-3.5"/> บันทึกใน CRM</>
                }
              </Button>
            </div>

            {/* Open LINE OA Manager (admin only) */}
            <a href="https://manager.line.biz" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition py-1">
              <ExternalLink className="size-3"/>
              เปิด LINE OA Manager (จัดการบัญชีทั้งหมด)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
