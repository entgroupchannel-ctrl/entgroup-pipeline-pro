// Reusable confirm dialog — replaces window.confirm() everywhere
// Usage:
//   const confirm = useConfirm();
//   await confirm({ title: "ลบดีล?", description: "...", confirmLabel: "ลบ", variant: "danger" })

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Trash2, Info, CheckCircle2, Loader2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConfirmVariant = "danger" | "warning" | "info" | "success";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** If provided, shows an async spinner while promise resolves */
  onConfirm?: () => Promise<void> | void;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

// ── Context ───────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

// ── Provider (wrap in app root or layout) ─────────────────────────────────────

interface State extends ConfirmOptions {
  open: boolean;
  loading: boolean;
}

const INITIAL: State = {
  open: false, loading: false,
  title: "", description: "",
  confirmLabel: "ยืนยัน", cancelLabel: "ยกเลิก",
  variant: "danger",
};

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const resolveRef = useRef<(v: boolean) => void>(() => {});

  const confirm: ConfirmFn = useCallback((opts) => {
    setState({ ...INITIAL, ...opts, open: true, loading: false });
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
  }, []);

  const handleConfirm = async () => {
    if (state.onConfirm) {
      setState(s => ({ ...s, loading: true }));
      try { await state.onConfirm!(); } catch { /* error handled by caller */ }
      setState(s => ({ ...s, loading: false, open: false }));
    } else {
      setState(s => ({ ...s, open: false }));
    }
    resolveRef.current(true);
  };

  const handleCancel = () => {
    setState(s => ({ ...s, open: false }));
    resolveRef.current(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state.open}
        loading={state.loading}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel ?? "ยืนยัน"}
        cancelLabel={state.cancelLabel ?? "ยกเลิก"}
        variant={state.variant ?? "danger"}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

// ── Dialog UI ─────────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ConfirmVariant, {
  icon: React.ReactNode;
  iconBg: string;
  confirmCls: string;
}> = {
  danger: {
    icon: <Trash2 className="h-5 w-5 text-red-600" />,
    iconBg: "bg-red-100 dark:bg-red-950/40",
    confirmCls: "bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-500",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
    iconBg: "bg-amber-100 dark:bg-amber-950/40",
    confirmCls: "bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-500",
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-600" />,
    iconBg: "bg-blue-100 dark:bg-blue-950/40",
    confirmCls: "",
  },
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
    iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
    confirmCls: "bg-emerald-600 hover:bg-emerald-700 text-white focus-visible:ring-emerald-500",
  },
};

function ConfirmDialog({
  open, loading, title, description,
  confirmLabel, cancelLabel, variant,
  onConfirm, onCancel,
}: {
  open: boolean; loading: boolean;
  title: string; description?: string;
  confirmLabel: string; cancelLabel: string;
  variant: ConfirmVariant;
  onConfirm: () => void; onCancel: () => void;
}) {
  const cfg = VARIANT_CONFIG[variant];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onCancel(); }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => { if (loading) e.preventDefault(); }}>
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cfg.iconBg}`}>
              {cfg.icon}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="text-base">{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="min-w-[80px]"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={`min-w-[80px] ${cfg.confirmCls}`}
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
