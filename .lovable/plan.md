
## เป้าหมาย

ในหน้า Pipeline → tab **B2B** เพิ่มปุ่ม **"สร้าง QT"** อีก 1 ปุ่ม (ข้างปุ่ม "รับงาน") เมื่อคลิกจะสร้างใบเสนอราคาเป็น **draft ใน FlowAccount** พร้อมข้อมูลลูกค้า + รายการสินค้าที่ prefill ให้เรียบร้อย แล้ว **เปิดแท็บใหม่ไปหน้าแก้ไข QT ตัวนั้นใน FlowAccount** เพื่อให้เซลส์ตรวจ/ปรับ/กด "ส่ง" เอง

## ทำไมต้องผ่าน FA API (ไม่ใช่ URL prefill)

FlowAccount ไม่รองรับการ prefill ผ่าน query string บน URL — จึงต้องสร้าง draft ผ่าน API `POST /quotations` ก่อน แล้วจึง redirect ไปที่ document ที่สร้างไว้ ผู้ใช้จะเห็นข้อมูลครบทันทีในหน้าจริงของ FA

## UX Flow

```text
[B2B tab row]                             
  ├─ ปุ่ม "รับงาน"    → สร้าง Lead ใน CRM (เดิม)
  └─ ปุ่ม "สร้าง QT"  → NEW
        │
        ▼
  Dialog "ตรวจสอบก่อนสร้างใน FlowAccount"
    • ข้อมูลลูกค้า (บริษัท / ผู้ติดต่อ / อีเมล / โทร)   [แก้ไขได้]
    • รายการสินค้า (ชื่อ / จำนวน / ราคา/หน่วย / รวม)   [แก้ไขได้]
    • วันที่ออก (วันนี้) / วันหมดอายุ (default +30 วัน)
    • หมายเหตุ + VAT 7% toggle
    • เลือก/สร้าง FA contact อัตโนมัติจากชื่อบริษัท
    [ยกเลิก]  [สร้างใน FlowAccount →]
        │
        ▼ คลิก "สร้างใน FlowAccount"
  1. เรียก server fn createFAQuotationFromB2B
  2. FA API: POST /quotations (draft)
  3. บันทึกลง crm.quotations (source=flowaccount, ผูก lead ถ้ามี)
  4. window.open(FA_URL, "_blank")  ← เปิดแท็บใหม่ไปหน้าแก้ไข
  5. toast: "สร้าง QT ใน FlowAccount แล้ว — เปิดในแท็บใหม่"
```

## สิ่งที่ต้องทำ

### 1. Server function ใหม่ — `src/lib/flowaccount.functions.ts`

`createFAQuotationFromB2B` (มี `requireSupabaseAuth`):
- Input: `{ b2b_request_id, customer, items, issued_date, valid_until, note, vat_rate, lead_id? }`
- ขั้นตอน:
  1. Match / create FA contact จากชื่อบริษัท (`GET /contacts?keyword=...` แล้ว fallback `POST /contacts`)
  2. `POST /quotations` — สร้าง draft พร้อม items
  3. Insert `crm.quotations` (source=flowaccount, quotation_no, grand_total, lead_id, valid_until, ฯลฯ)
  4. Return `{ quotation_no, fa_url }` โดย `fa_url = https://app.flowaccount.com/document/quotations/{doc_id}/edit` (หรือ URL ที่ FA คืนจาก response)

### 2. Dialog ใหม่ — `src/components/pipeline/CreateFAQuotationDialog.tsx`

- รับ prop: `request: B2BQuoteRequest`, `open`, `onOpenChange`, `leadId?`
- Prefill 3 กลุ่ม: ลูกค้า / รายการสินค้า / วันที่+VAT
- Loading state ตอนกด "สร้างใน FlowAccount" (~2-5 วิ เพราะรอ FA API)
- Error: แสดง error message ชัด ๆ (FA credential หมดอายุ, ชื่อสินค้าซ้ำ ฯลฯ)
- Success: `window.open(fa_url, "_blank")` + close dialog + toast

### 3. B2BRequestsTab — เพิ่มปุ่ม

ใน action group (บรรทัด ~234–263) เพิ่มปุ่ม "สร้าง QT" (icon `FileText`) คู่กับปุ่ม "รับงาน"
- ปุ่ม "สร้าง QT" ใช้ได้ทั้ง **ก่อน** และ **หลัง** "รับงาน"
- ถ้า `claimedIds` มี id นี้ (มี lead แล้ว) → ส่ง `leadId` ให้ dialog เพื่อผูกกับ lead

### 4. เพิ่มปุ่มเดียวกันใน `LeadQuotationsSection` (bonus, ตอบข้อ 3)

ในส่วน action bar ของ section ใบเสนอราคาใน LeadDetailSheet เพิ่มปุ่ม **"สร้างที่ FA"** (คู่กับปุ่ม "FA" import และ "สร้าง" ปัจจุบัน) เพื่อให้ flow ใช้ได้จากทั้ง B2B tab และ Lead detail

## Technical Details

**FA API endpoints ที่ใช้:**
- `GET /contacts?keyword={company}` — หา contact จากชื่อบริษัท
- `POST /contacts` — สร้าง contact ใหม่ (ถ้าไม่เจอ)
- `POST /quotations` — สร้าง QT draft (payload มี `contactId`, `items[]`, `issueDate`, `dueDate`, `vatType`, `remark`)
- Response ให้ document number + document id เพื่อสร้าง URL

**faFetch พร้อมอยู่แล้ว** ใน `src/lib/flowaccount.server.ts` — รองรับ POST, จัดการ OAuth token refresh อัตโนมัติ

**crm.quotations insert:** ใช้ schema เดิม (source='flowaccount', quotation_no, grand_total, lead_id, valid_until, source_document_id) — ไม่มี migration ใหม่

**Auth/RLS:** server fn มี `requireSupabaseAuth`; owner_id = ผู้ใช้ปัจจุบัน

## ความเสี่ยง / จุดต้องทดสอบ

1. **FA API rate limit / timeout** — POST /quotations อาจใช้ 2–5 วิ ต้องมี loading state ชัด + timeout handling
2. **FA contact matching** — ชื่อบริษัทอาจสะกดต่าง (มี "จำกัด" / ไม่มี) → ใช้ ilike/normalized match แล้ว fallback สร้างใหม่
3. **สินค้า SKU ไม่ตรงกับใน FA** — ส่งเป็น free-form item (ไม่ผูก productId) เพื่อไม่ให้ล้ม
4. **VAT** — B2B request บาง entry ไม่มี VAT breakdown → default vat_rate = 7, vatType = "3" (VAT included) หรือปรับตาม config เดิม
5. **URL structure ของ FA** — ต้องเช็คจาก response จริงว่า field ไหนใช้เป็น edit URL ได้ (อาจเป็น `documentSerial` หรือ `documentId`)

## นอกขอบเขต (ไม่ทำในรอบนี้)

- ไม่ทำ webhook รับสถานะกลับจาก FA (จะใช้ sync ปัจจุบันแทน)
- ไม่ auto-send email จาก FA (ปล่อยให้เซลส์กดใน FA เอง)
- ไม่แก้ FA settings UI
