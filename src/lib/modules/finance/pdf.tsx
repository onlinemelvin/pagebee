import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatMoney } from "./money";
import type { DocumentDTO } from "./service";

// Server-side PDF for an estimate/quote/invoice using @react-pdf/renderer (pure JS — no headless
// browser, deploys cleanly on Vercel). Generated on send (attached to the email) and on demand via
// the download routes. Layout intentionally clean/print-friendly.

export interface PdfBusiness {
  name: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

const DOC_TITLE: Record<string, string> = { ESTIMATE: "ESTIMATE", QUOTE: "QUOTE", INVOICE: "INVOICE" };

const C = { ink: "#1c1917", soft: "#78716c", line: "#e7e5e4", amber: "#b45309", faint: "#f5f5f4" };

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: C.ink, fontFamily: "Helvetica", lineHeight: 1.4 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  bizName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  soft: { color: C.soft },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  docMeta: { textAlign: "right", color: C.soft, marginTop: 2 },
  sectionLabel: { fontSize: 8, color: C.soft, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  block: { marginTop: 22 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 4, marginBottom: 2 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 5 },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 40, textAlign: "right" },
  cUnit: { width: 70, textAlign: "right" },
  cAmt: { width: 80, textAlign: "right" },
  thText: { fontSize: 8, color: C.soft, textTransform: "uppercase", letterSpacing: 0.5 },
  totals: { marginTop: 12, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.ink, marginTop: 4, paddingTop: 5 },
  grand: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  bold: { fontFamily: "Helvetica-Bold" },
  noteBox: { marginTop: 24, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, textAlign: "center", color: C.soft, fontSize: 8 },
});

function fdate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function DocPdf({ doc, business }: { doc: DocumentDTO; business: PdfBusiness }) {
  const cur = doc.currency;
  const isInvoice = doc.docType === "INVOICE";
  return (
    <Document title={`${DOC_TITLE[doc.docType]} ${doc.number}`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.between}>
          <View>
            <Text style={s.bizName}>{business.name ?? "Your Business"}</Text>
            {business.address ? <Text style={s.soft}>{business.address}</Text> : null}
            {business.email ? <Text style={s.soft}>{business.email}</Text> : null}
            {business.phone ? <Text style={s.soft}>{business.phone}</Text> : null}
          </View>
          <View>
            <Text style={s.docTitle}>{DOC_TITLE[doc.docType]}</Text>
            <Text style={s.docMeta}>{doc.number}</Text>
          </View>
        </View>

        {/* Meta row: bill-to + dates */}
        <View style={[s.between, s.block]}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionLabel}>Bill to</Text>
            <Text style={s.bold}>{doc.customerName ?? "—"}</Text>
            {doc.customerEmail ? <Text style={s.soft}>{doc.customerEmail}</Text> : null}
            {doc.customerPhone ? <Text style={s.soft}>{doc.customerPhone}</Text> : null}
          </View>
          <View style={{ width: 200 }}>
            <View style={s.totalRow}><Text style={s.soft}>Issued</Text><Text>{fdate(doc.issueDate)}</Text></View>
            {isInvoice ? (
              <View style={s.totalRow}><Text style={s.soft}>Due</Text><Text>{fdate(doc.dueDate)}</Text></View>
            ) : (
              <View style={s.totalRow}><Text style={s.soft}>Valid until</Text><Text>{fdate(doc.expiresAt)}</Text></View>
            )}
            <View style={s.totalRow}><Text style={s.soft}>Status</Text><Text>{doc.status.replace("_", " ")}</Text></View>
          </View>
        </View>

        {/* Line items */}
        <View style={s.block}>
          <View style={s.th}>
            <Text style={[s.cDesc, s.thText]}>Description</Text>
            <Text style={[s.cQty, s.thText]}>Qty</Text>
            <Text style={[s.cUnit, s.thText]}>Unit</Text>
            <Text style={[s.cAmt, s.thText]}>Amount</Text>
          </View>
          {doc.lineItems.map((l) => (
            <View key={l.id} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>{l.description}</Text>
              <Text style={s.cQty}>{l.quantity}</Text>
              <Text style={s.cUnit}>{formatMoney(l.unitAmount, cur)}</Text>
              <Text style={s.cAmt}>{formatMoney(l.amount, cur)}</Text>
            </View>
          ))}

          {/* Totals */}
          <View style={s.totals}>
            <View style={s.totalRow}><Text style={s.soft}>Subtotal</Text><Text>{formatMoney(doc.subtotal, cur)}</Text></View>
            {doc.discountTotal > 0 ? <View style={s.totalRow}><Text style={s.soft}>Discount</Text><Text>−{formatMoney(doc.discountTotal, cur)}</Text></View> : null}
            {doc.tax > 0 ? <View style={s.totalRow}><Text style={s.soft}>Tax</Text><Text>{formatMoney(doc.tax, cur)}</Text></View> : null}
            <View style={s.grandRow}><Text style={s.grand}>Total</Text><Text style={s.grand}>{formatMoney(doc.total, cur)}</Text></View>
            {doc.amountPaid > 0 ? <View style={s.totalRow}><Text style={s.soft}>Paid</Text><Text>−{formatMoney(doc.amountPaid, cur)}</Text></View> : null}
            {isInvoice && doc.balanceDue > 0 && doc.amountPaid > 0 ? <View style={s.totalRow}><Text style={s.bold}>Balance due</Text><Text style={s.bold}>{formatMoney(doc.balanceDue, cur)}</Text></View> : null}
            {isInvoice && doc.depositAmount > 0 && doc.amountPaid === 0 ? <View style={s.totalRow}><Text style={s.soft}>Deposit requested</Text><Text>{formatMoney(doc.depositAmount, cur)}</Text></View> : null}
          </View>
        </View>

        {/* Notes & terms */}
        {(doc.notes || doc.terms) && (
          <View style={s.noteBox}>
            {doc.notes ? (<><Text style={s.sectionLabel}>Notes</Text><Text style={{ marginBottom: 8 }}>{doc.notes}</Text></>) : null}
            {doc.terms ? (<><Text style={s.sectionLabel}>Terms</Text><Text>{doc.terms}</Text></>) : null}
          </View>
        )}

        <Text style={s.footer} fixed>{business.name ?? ""} · {doc.number}</Text>
      </Page>
    </Document>
  );
}

/** Render a document to a PDF Buffer. */
export async function renderDocumentPdf(doc: DocumentDTO, business: PdfBusiness): Promise<Buffer> {
  return renderToBuffer(<DocPdf doc={doc} business={business} />);
}

/** Filename like "Invoice-INV-0007.pdf". */
export function pdfFilename(doc: DocumentDTO): string {
  const label = doc.docType.charAt(0) + doc.docType.slice(1).toLowerCase();
  return `${label}-${doc.number}.pdf`;
}
