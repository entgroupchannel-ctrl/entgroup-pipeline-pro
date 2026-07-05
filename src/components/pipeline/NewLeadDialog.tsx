import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

export function NewLeadDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    account_id: "",
    new_account_name: "",
    expected_value: "",
    source: "",
    flowaccount_quotation_no: "",
  });

  // Track if user is creating a new company vs selecting existing
  const [mode, setMode] = useState<"select" | "create">("select");

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode("select");
    setComboOpen(false);
    setForm({
      title: "", account_id: "", new_account_name: "",
      expected_value: "", source: "", flowaccount_quotation_no: "",
    });
    crmDb()
      .from("accounts")
      .select("id,name")
      .order("name")
      .then(({ data }: any) => setAccounts(data ?? []));
    // Focus title after open animation
    setTimeout(() => titleRef.current?.focus(), 80);
  }, [open]);

  const selectedAccount = accounts.find((a) => a.id === form.account_id);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("กรุณาระบุชื่อดีล");
      return;
    }
    setSaving(true);

    let account_id: string | null = form.account_id || null;

    // Create new company if user typed a name
    if (mode === "create" && form.new_account_name.trim()) {
      const { data, error } = await crmDb()
        .from("accounts")
        .insert({ name: form.new_account_name.trim(), owner_id: user?.id, created_by: user?.id })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        toast.error("สร้างบริษัทไม่สำเร็จ", { description: error.message });
        return;
      }
      account_id = data.id;
    }

    const { error } = await crmDb().from("leads").insert({
      title: form.title.trim(),
      stage: "new",
      account_id,
      expected_value: form.expected_value ? Number(form.expected_value) : null,
      source: form.source || null,
      flowaccount_quotation_no: form.flowaccount_quotation_no || null,
      owner_id: user?.id,
      created_by: user?.id,
    });

    setSaving(false);
    if (error) {
      toast.error("สร้างดีลไม่สำเร็จ", { description: error.message });
      return;
    }
    toast.success("สร้างดีลใหม่แล้ว");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มดีลใหม่</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── ชื่อดีล ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">ชื่อดีล <span className="text-red-500">*</span></Label>
            <Input
              ref={titleRef}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="เช่น โปรเจกต์ AI — บริษัท XYZ"
            />
          </div>

          {/* ── บริษัท (Searchable Combobox) ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">บริษัท</Label>

            {/* Toggle select vs create */}
            <div className="flex rounded-lg border overflow-hidden text-xs mb-2">
              <button
                type="button"
                onClick={() => { setMode("select"); setForm((f) => ({ ...f, new_account_name: "" })); }}
                className={`flex-1 py-1.5 transition-colors ${
                  mode === "select" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                เลือกบริษัทที่มีอยู่
              </button>
              <button
                type="button"
                onClick={() => { setMode("create"); setForm((f) => ({ ...f, account_id: "" })); }}
                className={`flex-1 py-1.5 border-l transition-colors ${
                  mode === "create" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <Plus className="inline h-3 w-3 mr-1" />สร้างบริษัทใหม่
              </button>
            </div>

            {mode === "select" ? (
              /* Searchable combobox */
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background",
                      "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      !selectedAccount && "text-muted-foreground"
                    )}
                  >
                    <span className="truncate">
                      {selectedAccount ? selectedAccount.name : "— ค้นหาหรือเลือกบริษัท —"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
                  <Command>
                    <CommandInput placeholder="พิมพ์ชื่อบริษัท..." />
                    <CommandList className="max-h-56">
                      <CommandEmpty>
                        <div className="py-3 text-center text-xs text-muted-foreground">
                          ไม่พบบริษัท — ลองสร้างใหม่
                        </div>
                      </CommandEmpty>
                      {/* Clear selection option */}
                      {form.account_id && (
                        <CommandGroup>
                          <CommandItem
                            value="__clear__"
                            onSelect={() => {
                              setForm((f) => ({ ...f, account_id: "" }));
                              setComboOpen(false);
                            }}
                            className="text-muted-foreground"
                          >
                            — ไม่ระบุบริษัท —
                          </CommandItem>
                        </CommandGroup>
                      )}
                      <CommandGroup heading={`${accounts.length} บริษัท`}>
                        {accounts.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={a.name}           // cmdk searches by value
                            onSelect={() => {
                              setForm((f) => ({ ...f, account_id: a.id }));
                              setComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 shrink-0",
                                form.account_id === a.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {a.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              /* Create new company */
              <Input
                autoFocus
                placeholder="ชื่อบริษัทใหม่"
                value={form.new_account_name}
                onChange={(e) => setForm({ ...form, new_account_name: e.target.value })}
              />
            )}
          </div>

          {/* ── มูลค่า + ที่มา ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">มูลค่าคาดหวัง (บาท)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.expected_value}
                onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ที่มา</Label>
              <Select
                value={form.source || "none"}
                onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุ</SelectItem>
                  <SelectItem value="line_oa">LINE OA</SelectItem>
                  <SelectItem value="website">เว็บไซต์</SelectItem>
                  <SelectItem value="referral">แนะนำ</SelectItem>
                  <SelectItem value="key_account">Key Account</SelectItem>
                  <SelectItem value="flowaccount">FlowAccount</SelectItem>
                  <SelectItem value="other">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── FlowAccount QT ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">เลขที่ใบเสนอราคา FA <span className="text-muted-foreground">(ไม่บังคับ)</span></Label>
            <Input
              value={form.flowaccount_quotation_no}
              onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })}
              placeholder="QT-2026-XXXX"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            สร้างดีล
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
