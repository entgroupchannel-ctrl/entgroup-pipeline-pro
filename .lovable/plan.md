## ปัญหา
หน้า `/key-accounts` โหลดไม่สำเร็จ เพราะ database schema ยังไม่มี:
- คอลัมน์ `is_key_account` ใน `crm.accounts`
- ตาราง `crm.key_account_targets`

โค้ดหน้า route ถูกสร้างไว้แล้ว แต่ query อ้างถึงสิ่งที่ยังไม่มีจริง → PostgREST return error → toast "โหลด Key Accounts ไม่สำเร็จ"

## แผนแก้

### 1. Migration (schema `crm`)
```sql
ALTER TABLE crm.accounts
  ADD COLUMN IF NOT EXISTS is_key_account boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS crm.key_account_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES crm.accounts(id) ON DELETE CASCADE,
  visit_target int NOT NULL DEFAULT 1,
  call_target  int NOT NULL DEFAULT 2,
  line_target  int NOT NULL DEFAULT 3,
  email_target int NOT NULL DEFAULT 1,
  quote_target int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- GRANT + RLS ตาม pattern เดียวกับตาราง crm อื่น ๆ (authenticated เต็มสิทธิ์, service_role ALL)
```

### 2. ไม่แตะโค้ดหน้า
หลัง migration ผ่าน + types regenerate หน้า `/key-accounts` จะโหลดได้ทันที (ตอนนี้ยังไม่มีบริษัทที่ `is_key_account=true` ดังนั้นรายการจะว่าง — เป็นพฤติกรรมที่ถูกต้อง ผู้ใช้ต้องไป toggle จากหน้า accounts เอง)

## หมายเหตุ
ยังไม่มี UI สำหรับ toggle `is_key_account` หรือแก้ target — ถ้าต้องการให้เพิ่มด้วย บอกได้ (ต้องแก้ `accounts.tsx` เพิ่ม)
