แทนที่ `src/routes/_authenticated/accounts.$accountId.tsx` ด้วยไฟล์ที่แนบมา (`accounts.$accountId_1.tsx`, 761 บรรทัด) ตามเนื้อหาเป๊ะ

เปลี่ยนจาก 2-column แน่น → Tab layout 3 แท็บ:
- ข้อมูลบริษัท — form + ปุ่ม Save ชัดเจน (แทน auto-save onBlur)
- ผู้ติดต่อ (N) — list cards + ปุ่มเพิ่ม
- ดีล (N) — list + pipeline summary
- Top bar โชว์ KPI inline, ปุ่ม Back → "รายชื่อลูกค้า"

หลัง deploy จะรัน typecheck + build ยืนยัน