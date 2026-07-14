สาเหตุที่เจอตอนนี้: browser request ไป `b2b-quotes` ไม่ได้เพราะ endpoint ตอบ `500 WORKER_ERROR` และ preflight `OPTIONS` ก็ 500; response ยังไม่ allow header `x-crm-secret` ทำให้ฝั่งเว็บขึ้น `Failed to fetch` ได้แม้ Verify JWT ปิดแล้ว

แผนแก้:
1. แก้ edge function `b2b-quotes` ใน B2B project ให้มี CORS handler ตั้งแต่ต้นไฟล์
   - `OPTIONS` ต้องตอบ 200/204 ทันที
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Headers` ต้องรวม `x-crm-secret, content-type, authorization, apikey, x-client-info`
   - ทุก response ทั้ง success/error ต้องแนบ CORS headers
2. ตรวจสอบ code ใน function ว่า secret check อ่าน `x-crm-secret` ได้ และ error path ไม่ throw จนกลายเป็น `WORKER_ERROR`
3. ทดสอบ direct GET และ OPTIONS อีกครั้ง
   - GET ต้องได้ 200 พร้อม `{ data: [...] }`
   - OPTIONS ต้องได้ 200/204 และมี `Access-Control-Allow-Headers` รวม `x-crm-secret`
4. ไม่ต้องแก้ CRM frontend ก่อน ยกเว้นต้องการให้ error message แสดงรายละเอียดเพิ่ม เพราะ code `B2BRequestsTab` เรียก endpoint ถูกแล้วผ่าน `fetchUnmatchedQuotes()`