## เป้าหมาย
เพิ่มแท็บใหม่ "📩 ข้อความ" ในหน้า Pipeline เพื่อแสดง/ตอบสนทนา B2B (`quote_messages`) ผ่าน edge function `b2b-quotes` ที่มีอยู่แล้ว

## ไฟล์ที่จะเปลี่ยน (จาก zip อัปโหลด)
1. **สร้างใหม่**: `src/components/pipeline/B2BConversationTab.tsx` (592 บรรทัด) — คอมโพเนนต์ Tab ข้อความ พร้อม conversation list ซ้าย + chat panel ขวา, badge unread, ปุ่มลิงก์ไป Lead ที่ claim แล้ว
2. **แก้ไข**: `src/routes/_authenticated/pipeline.tsx` — เพิ่ม state `messages` tab, import `B2BConversationTab`, render เมื่อเลือกแท็บ

## ฟีเจอร์
- รายการ conversation เรียงตาม unread ก่อน + badge นับข้อความยังไม่อ่าน
- Chat panel: ประวัติสนทนา + input ตอบกลับ (Enter/ปุ่มส่ง)
- ส่งข้อความผ่าน edge function → บันทึก activity log ใน CRM ด้วย
- ถ้า Lead claim แล้ว: ไอคอน ✓ + ลิงก์ไปหน้า Lead

## Dependency ฝั่ง B2B (ENTerprise project)
Edge function `b2b-quotes` ต้องรองรับเพิ่ม:
- `GET ?messages=1&quote_request_id=XXX` → คืน `quote_messages[]`
- `POST /messages` body `{ quote_request_id, sender_type, sender_name, content }` → insert

ถ้ายังไม่ deploy: list ยังทำงานแต่ข้อความว่าง, การตอบกลับ fallback บันทึกใน CRM activity log อย่างเดียว

## ขั้นตอน build
1. คัดลอก `B2BConversationTab.tsx` จาก `/mnt/user-uploads/files_25.zip` ไปที่ `src/components/pipeline/`
2. เขียนทับ `src/routes/_authenticated/pipeline.tsx` ด้วยเวอร์ชันจาก zip
3. รอ typecheck อัตโนมัติ verify ว่า build ผ่าน
