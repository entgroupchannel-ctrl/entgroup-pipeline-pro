import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Loader2, FileText, Image, File, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

const BUCKET = "email-attachments";
const MAX_MB = 10;
const CATEGORIES = ["Company Profile", "Product Catalog", "ใบเสนอราคาตัวอย่าง", "โปรโมชัน", "ทั่วไป"];

interface MediaFile {
  id: string;
  name: string;
  filename: string;
  size: number;
  mime_type: string;
  storage_path: string;
  public_url: string;
  category: string;
  created_at: string;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <Image className="h-5 w-5 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryTab() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("ทั่วไป");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("ทั้งหมด");

  const load = async () => {
    setLoading(true);
    const { data } = await crmDb().from("email_attachments").select("*").order("created_at", { ascending: false });
    const rows = (data ?? []) as MediaFile[];
    // Bucket is private — sign each URL for display/copy (1 hour)
    const signed = await Promise.all(rows.map(async (f) => {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60 * 60);
      return { ...f, public_url: s?.signedUrl ?? "" };
    }));
    setFiles(signed);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`ไฟล์ใหญ่เกิน ${MAX_MB}MB`);
      return;
    }
    const name = uploadName.trim() || file.name.replace(/\.[^/.]+$/, "");
    const ext = file.name.split(".").pop() ?? "";
    const path = `${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;

    setUploading(true);
    try {
      // Upload to Supabase Storage
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      // Private bucket — persist only storage_path; sign URLs on demand.
      const publicUrl = "";

      // Save metadata to DB
      const { error: dbErr } = await crmDb().from("email_attachments").insert({
        name,
        filename: file.name,
        size: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: path,
        public_url: publicUrl,
        category: uploadCategory,
        uploaded_by: user?.id,
      });
      if (dbErr) throw new Error(dbErr.message);

      toast.success(`อัปโหลด "${name}" แล้ว`);
      setUploadName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err: any) {
      toast.error("อัปโหลดไม่สำเร็จ", { description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (f: MediaFile) => {
    if (!confirm(`ลบ "${f.name}" ?`)) return;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await crmDb().from("email_attachments").delete().eq("id", f.id);
    toast.success("ลบแล้ว");
    load();
  };

  const copyUrl = async (f: MediaFile) => {
    // Regenerate a fresh 24h signed URL for sharing.
    const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60 * 60 * 24);
    const url = s?.signedUrl ?? f.public_url;
    navigator.clipboard.writeText(url);
    setCopiedId(f.id);
    toast.success("คัดลอก URL แล้ว (หมดอายุใน 24 ชม.)");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allCats = ["ทั้งหมด", ...Array.from(new Set(files.map((f) => f.category)))];
  const filtered = catFilter === "ทั้งหมด" ? files : files.filter((f) => f.category === catFilter);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Media Library</h2>
        <p className="text-xs text-muted-foreground mt-0.5">อัปโหลดไฟล์สำหรับแนบใน email — สูงสุด {MAX_MB}MB ต่อไฟล์</p>
      </div>

      {/* Upload zone */}
      <div className="rounded-xl border-2 border-dashed bg-muted/20 p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">ชื่อไฟล์ (ที่จะแสดงในระบบ)</Label>
            <Input placeholder="เช่น Company Profile 2026" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">หมวดหมู่</Label>
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleUpload} className="hidden" />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {uploading ? "กำลังอัปโหลด..." : "เลือกไฟล์"}
          </Button>
          <p className="text-xs text-muted-foreground">PDF, Word, Excel, PNG, JPG · สูงสุด {MAX_MB}MB</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {allCats.map((c) => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${catFilter === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {c}
          </button>
        ))}
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Upload className="mx-auto mb-2 h-8 w-8 opacity-20" />
          ยังไม่มีไฟล์ — อัปโหลดไฟล์แรกได้เลย
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card overflow-hidden">
          {filtered.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <FileIcon mime={f.mime_type} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.filename} · {formatSize(f.size)} · <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px]">{f.category}</span></p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a href={f.public_url} target="_blank" rel="noreferrer"
                  className="rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  ดู
                </a>
                <button onClick={() => copyUrl(f)}
                  className="rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1">
                  {copiedId === f.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  URL
                </button>
                <button onClick={() => deleteFile(f)}
                  className="rounded border px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
