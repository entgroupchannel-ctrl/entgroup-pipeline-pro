## เป้าหมาย
ตัวอักษรตอนนี้เล็กเกินไป ต้องขยาย + rebalance ทั้งแอป และเพิ่มระบบให้ผู้ใช้ปรับได้เอง (ขนาด + ธีม)

## สิ่งที่จะทำ

### 1. ยกฐาน Typography ทั้งระบบ (CSS-first)
ปรับใน `src/styles.css`:
- ตั้ง `html { font-size: 16px }` เป็นฐาน (จากเดิมที่หลาย component ใช้ text-xs/text-sm เยอะเกินไป)
- นิยาม type scale ใหม่ผ่าน CSS variables:
  - `--text-xs: 0.8125rem` (13px, จากเดิม 12px)
  - `--text-sm: 0.9375rem` (15px, จากเดิม 14px)
  - `--text-base: 1.0625rem` (17px)
  - `--text-lg: 1.25rem`, `--text-xl: 1.5rem`, `--text-2xl: 1.875rem`, `--text-3xl: 2.25rem`
- ปรับ `line-height` และ `letter-spacing` ให้อ่านง่ายขึ้น (body 1.6, heading 1.2)
- weight: body 400, heading 600–700 เพื่อความ balance

### 2. ระบบปรับขนาดตัวอักษร (S / M / L)
- เพิ่ม `data-font-size` attribute บน `<html>` (`sm` / `md` / `lg`)
- แต่ละระดับปรับ `html { font-size }` (14 / 16 / 18px) → rem-based utility ของ Tailwind ขยาย/ย่อทั้งแอปอัตโนมัติ
- สร้าง `FontSizeProvider` (React context) + persist ลง `localStorage`
- Toggle group 3 ปุ่ม (A- / A / A+) แสดงใน header/topbar

### 3. ระบบ Dark / Light Mode
- ใช้ `next-themes` หรือ context เอง (เลือก context เพื่อไม่เพิ่ม dep — toggle `.dark` class บน `<html>`)
- persist ลง `localStorage` + respect `prefers-color-scheme` ครั้งแรก
- ตรวจสอบว่า design tokens ใน `src/styles.css` มีทั้ง `:root` และ `.dark` ครบทุก token
- ปุ่ม toggle icon (Sun/Moon) วางคู่กับ font-size toggle

### 4. UI Control Panel
เพิ่มแถบตั้งค่าเล็กๆ (segmented control) วางใน topbar/header ของ layout หลัก:
```
[ A-  A  A+ ]   [ ☀ / 🌙 ]
```
- ใช้ shadcn `ToggleGroup` + `Button` (variant ghost)
- แสดงในทุกหน้า (วางใน layout ที่ครอบ authenticated routes)

## ไฟล์ที่จะแตะ
- `src/styles.css` — type scale, dark tokens ครบ
- `src/lib/preferences-context.tsx` (ใหม่) — font size + theme context
- `src/components/preferences-toggle.tsx` (ใหม่) — UI toggles
- `src/routes/__root.tsx` — mount provider + apply attribute early (no hydration flash)
- Layout/topbar component — ใส่ปุ่ม toggle

## ผลลัพธ์
- ตัวอักษรใหญ่ขึ้นสมดุลขึ้นทันที by default
- ผู้ใช้ปรับ S/M/L + Dark/Light เองได้ตามชอบ ค่าจะจำไว้