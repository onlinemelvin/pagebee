import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getTaxReport, getIncomeReport, get1099Summary } from "@/lib/modules/finance";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (cents: number) => (cents / 100).toFixed(2);
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

/** GET /api/v1/client/finance/reports/{tax|income}?from=&to= — downloadable CSV. */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { type } = await params;
  const url = new URL(req.url);
  const now = new Date();
  const from = parseDate(url.searchParams.get("from"), new Date(now.getFullYear(), 0, 1));
  const to = parseDate(url.searchParams.get("to"), now);
  const label = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;

  let csv: string;
  let filename: string;
  if (type === "tax") {
    const r = await getTaxReport(client.id, from, to);
    csv = toCsv([
      ["State", "Taxable sales", "Tax collected", "Invoices"],
      ...r.rows.map((row) => [row.state, money(row.salesBase), money(row.taxCollected), row.invoiceCount]),
      ["TOTAL", money(r.totalSales), money(r.totalTax), ""],
    ]);
    filename = `sales-tax_${label}.csv`;
  } else if (type === "income") {
    const r = await getIncomeReport(client.id, from, to);
    csv = toCsv([
      ["Invoice", "Customer", "Paid date", "Total", "Collected"],
      ...r.rows.map((row) => [row.number, row.customer, row.paidAt?.slice(0, 10) ?? "", money(row.total), money(row.amountPaid)]),
      ["TOTAL", "", "", "", money(r.totalCollected)],
    ]);
    filename = `income_${label}.csv`;
  } else if (type === "1099") {
    const year = Number(url.searchParams.get("year")) || now.getFullYear();
    const s = await get1099Summary(client.id, year);
    csv = toCsv([
      [`1099-K summary ${year}`, ""],
      ["Month", "Gross card payments"],
      ...s.monthly.map((m) => [MONTHS[m.month - 1], money(m.amount)]),
      ["TOTAL (Box 1a)", money(s.gross)],
      ["Transactions", s.count],
    ]);
    filename = `1099k-summary_${year}.csv`;
  } else {
    return NextResponse.json({ error: "unknown_report" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
