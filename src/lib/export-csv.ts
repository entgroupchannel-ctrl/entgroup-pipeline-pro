// CSV export utility — works in browser, no external deps

export function exportToCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const escape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    // wrap in quotes if contains comma, newline, or quote
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];

  const bom = "\uFEFF"; // UTF-8 BOM for Excel Thai support
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Leads → CSV rows
export function leadsToRows(
  leads: any[],
  accountsMap: Map<string, string>,
  profilesMap: Map<string, { name: string }>,
  stageLabel: Record<string, string>,
) {
  return leads.map((l) => ({
    "ชื่อดีล":          l.title ?? "",
    "บริษัท":           l.account_id ? (accountsMap.get(l.account_id) ?? "") : "",
    "Stage":            stageLabel[l.stage] ?? l.stage ?? "",
    "มูลค่า (บาท)":     l.expected_value ?? "",
    "วันปิดคาดหวัง":    l.expected_close_date ?? "",
    "ที่มา":            l.source ?? "",
    "Sales":            l.owner_id ? (profilesMap.get(l.owner_id)?.name ?? "") : "",
    "Priority":         l.priority ?? 0,
    "สถานะ":           l.stage === "won" ? "ชนะ" : l.stage === "lost" ? "แพ้" : "Active",
    "อัปเดตล่าสุด":    l.updated_at ? l.updated_at.slice(0, 10) : "",
    "สร้างเมื่อ":       l.created_at ? l.created_at.slice(0, 10) : "",
  }));
}

// Accounts → CSV rows
export function accountsToRows(
  accounts: any[],
  leadsCountMap: Map<string, number>,
  profilesMap: Map<string, { name: string }>,
) {
  return accounts.map((a) => ({
    "ชื่อบริษัท":       a.name ?? "",
    "อุตสาหกรรม":       a.industry ?? "",
    "เว็บไซต์":         a.website ?? "",
    "โทรศัพท์":         a.phone ?? "",
    "ที่อยู่":           a.address ?? "",
    "Key Account":      a.is_key_account ? "ใช่" : "ไม่ใช่",
    "จำนวนดีล":         leadsCountMap.get(a.id) ?? 0,
    "เจ้าของ":          a.owner_id ? (profilesMap.get(a.owner_id)?.name ?? "") : "",
    "สร้างเมื่อ":       a.created_at ? a.created_at.slice(0, 10) : "",
  }));
}

// Quotations → CSV rows
export function quotationsToRows(
  quotations: any[],
  leadsMap: Map<string, string>,
  accountsMap: Map<string, string>,
  profilesMap: Map<string, { name: string }>,
  statusLabel: Record<string, string>,
) {
  return quotations.map((q) => ({
    "เลขที่":           q.quotation_no ?? "",
    "ชื่อ":             q.title ?? "",
    "บริษัท":           q.account_id ? (accountsMap.get(q.account_id) ?? "") : "",
    "ดีล":              q.lead_id ? (leadsMap.get(q.lead_id) ?? "") : "",
    "แหล่ง":            q.source === "flowaccount" ? "FlowAccount" : "CRM",
    "ราคาก่อน VAT":     q.subtotal ?? "",
    "ส่วนลด":           q.discount ?? 0,
    "VAT":              q.vat_amount ?? 0,
    "ยอดรวม (บาท)":     q.grand_total ?? "",
    "สถานะ":            statusLabel[q.status] ?? q.status ?? "",
    "วันที่ออก":        q.issued_date ?? "",
    "ใช้ได้ถึง":        q.valid_until ?? "",
    "เจ้าของ":          q.owner_id ? (profilesMap.get(q.owner_id)?.name ?? "") : "",
    "สร้างเมื่อ":       q.created_at ? q.created_at.slice(0, 10) : "",
  }));
}
