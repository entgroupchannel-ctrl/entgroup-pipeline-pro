# แก้ปัญหาคลิกลูกค้าแล้วหน้า detail ไม่เปิด

## สาเหตุ
การคลิก row navigate สำเร็จ (URL เปลี่ยนเป็น `/accounts/<id>` แล้ว — เห็นใน log) แต่หน้าไม่เปลี่ยน เพราะโครงสร้าง route:

- `accounts.$accountId.tsx` ถูก generate เป็น **child route** ของ `accounts.tsx`
- แต่ `accounts.tsx` (หน้า list) ไม่มี `<Outlet />` → child จึงไม่มีที่ render → หน้าจอค้างที่ list เดิม

## วิธีแก้
1. เปลี่ยนชื่อไฟล์ `src/routes/_authenticated/accounts.tsx` → `accounts.index.tsx` และแก้ path ใน `createFileRoute` เป็น `"/_authenticated/accounts/"`
2. ผลลัพธ์: หน้า list กับหน้า detail กลายเป็น sibling routes — detail จะ render เต็มหน้าแทน list เมื่อคลิก
3. route tree จะถูก regenerate อัตโนมัติ จากนั้น verify ด้วย typecheck + Playwright คลิก row จริง

ไม่กระทบ logic อื่นใด — เป็นการย้ายไฟล์ + แก้ path string 1 บรรทัดเท่านั้น