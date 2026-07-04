const bahtFmt = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export function formatBaht(v: number | null | undefined): string {
  if (v == null) return "฿0";
  return bahtFmt.format(v);
}

const thMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const day = d.getDate();
  const month = thMonths[d.getMonth()];
  const year = (d.getFullYear() + 543) % 100;
  return `${day} ${month} ${String(year).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: Date = new Date()): number {
  const a = new Date(from).getTime();
  const b = to.getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}
