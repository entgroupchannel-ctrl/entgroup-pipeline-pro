import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LineMessage {
  lead_id: string;
  contact_id: string;
  display_name: string;
  message: string;
  timestamp: string;
}

export function useLineRealtime() {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [latestMessage, setLatestMessage] = useState<LineMessage | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("crm:line_incoming")
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        const msg = payload as LineMessage;
        setLatestMessage(msg);
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.lead_id]: (prev[msg.lead_id] ?? 0) + 1,
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const clearBadge = useCallback((leadId: string) => {
    setUnreadCounts((prev) => { const n = { ...prev }; delete n[leadId]; return n; });
  }, []);

  return { unreadCounts, latestMessage, clearBadge };
}
