## สาเหตุ

`assertAdmin` ใน `src/lib/flowaccount.functions.ts` ใช้ `supabaseAdmin` (service_role key) เพื่ออ่าน `crm.user_profiles`:
- บรรทัด 11 เรียก `.from("crm.user_profiles")` → PostgREST error (ไม่รองรับชื่อ schema ในสตริง)
- fallback บรรทัด 17-23 ใช้ `.schema("crm")` แต่ Lovable Cloud อาจ inject secret key รูปแบบใหม่ (`sb_secret_*`) ที่ทำให้ Data API/PostgREST reads ล้มเหลว → `d2` เป็น null → throw "Forbidden: admin only"

ยืนยันจาก DB: user `therdpoom@entgroup.co.th` มี `role='admin'` จริง

## แผนแก้ (กระทบเฉพาะ assertAdmin)

เปลี่ยน `assertAdmin` ให้ใช้ **`context.supabase`** (authenticated user client จาก `requireSupabaseAuth`) แทน `supabaseAdmin`:

```ts
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .schema("crm")
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role !== "admin") throw new Error("Forbidden: admin only");
}
```

ทุก call site (`testFAConnection`, `loadFASettings`, และอื่นๆ ใน flowaccount.functions.ts) เปลี่ยนจาก `assertAdmin(context.userId)` → `assertAdmin(context.supabase, context.userId)`

## ทำไมวิธีนี้ปลอดภัย + ไม่กระทบอื่น
- RLS + grants บน schema `crm` เปิดให้ `authenticated` แล้ว (จาก migration ล่าสุด)
- ผู้ใช้อ่านแถวตัวเองได้เสมอ, ตรวจ role='admin' ทำงานถูกต้อง
- ไม่แตะ `supabaseAdmin` client, ไม่กระทบ server function อื่น
- แก้ไฟล์เดียว: `src/lib/flowaccount.functions.ts`