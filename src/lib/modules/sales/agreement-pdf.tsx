/* eslint-disable react/no-unescaped-entities -- @react-pdf <Text> is not HTML; literal quotes/
   apostrophes render correctly here and HTML entities (&apos; etc.) would print verbatim. */
import React from "react";
import { Document, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { ThemedPage, getLogoDataUrl, PDF, PDF_COMPANY } from "@/lib/modules/pdf/theme";
import type { CommissionTerms } from "./contracts";

// Server-side PDF of a signed Sales-Rep Commission Agreement, using @react-pdf/renderer (pure JS —
// no headless browser, deploys cleanly on Vercel). Generated when the rep e-signs: emailed to them
// and stored on `Contract.documentUrl`. The text mirrors the in-app agreement the rep accepted; the
// branded header/footer/honeycomb come from the shared PDF theme.

export interface AgreementPdfData {
  repName: string;
  repEmail: string | null;
  signatoryName: string; // the name the rep typed to sign
  signedAt: Date;
  contractTitle: string;
  auditRef?: string | null; // contract id — the signature audit reference
  ip?: string | null;
  resourcesUrl: string;
  terms: CommissionTerms;
}

const s = StyleSheet.create({
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  metaSoft: { color: PDF.soft },
  block: { marginTop: 16 },
  sectionLabel: { fontSize: 8, color: PDF.soft, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  clauseTitle: { fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 1 },
  para: { marginBottom: 2 },
  soft: { color: PDF.soft },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: PDF.ink, paddingBottom: 3, marginBottom: 1 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: PDF.line, paddingVertical: 4 },
  thText: { fontSize: 8, color: PDF.soft, textTransform: "uppercase", letterSpacing: 0.5 },
  cPlan: { flex: 1 },
  cNum: { width: 86, textAlign: "right" },
  callout: { marginTop: 14, backgroundColor: PDF.panel, borderRadius: 6, padding: 10, borderLeftWidth: 2, borderLeftColor: PDF.amber },
  signBox: { marginTop: 20, borderTopWidth: 1, borderTopColor: PDF.ink, paddingTop: 12 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
});

function fdate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Show a real public IP; loopback/empty values (e.g. local testing) carry no audit value → "—". */
function fip(ip?: string | null): string {
  const v = ip?.trim();
  if (!v || v === "::1" || v === "127.0.0.1" || v.startsWith("::ffff:127.")) return "—";
  return v;
}

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={s.clauseTitle}>
        {n}. {title}
      </Text>
      <Text style={s.para}>{children}</Text>
    </View>
  );
}

function Row({ plan, listed, floor, base }: { plan: string; listed: number; floor: number; base: number }) {
  const pctOff = listed > 0 ? Math.round(((listed - floor) / listed) * 100) : 0;
  return (
    <View style={s.tr}>
      <Text style={s.cPlan}>{plan}</Text>
      <Text style={s.cNum}>${listed}</Text>
      <Text style={s.cNum}>${floor}</Text>
      <Text style={s.cNum}>${listed - floor} ({pctOff}%)</Text>
      <Text style={[s.cNum, s.bold]}>${base}</Text>
    </View>
  );
}

function AgreementPdf({ data, logo }: { data: AgreementPdfData; logo: string | null }) {
  const t = data.terms;
  const recurring = t.recurringPct > 0 && t.recurringMonths > 0;
  return (
    <Document title={data.contractTitle} author={PDF_COMPANY.name}>
      <ThemedPage docTitle="Commission Agreement" docSubtitle="Independent Contractor" logo={logo}>
        {/* Title + signing meta */}
        <View style={s.metaRow}>
          <Text style={s.bold}>Sales-Rep Commission Agreement</Text>
          <Text style={s.metaSoft}>Signed {fdate(data.signedAt)}  ·  {t.planName}</Text>
        </View>

        {/* Parties */}
        <View style={s.block}>
          <Text style={s.sectionLabel}>Parties</Text>
          <Text style={s.para}>
            <Text style={s.bold}>{PDF_COMPANY.legalName}</Text> (the Company) and{" "}
            <Text style={s.bold}>{data.repName}</Text>
            {data.repEmail ? ` (${data.repEmail})` : ""} (the Rep), an independent contractor.
          </Text>
        </View>

        {/* Commission table */}
        <View style={s.block}>
          <Text style={s.sectionLabel}>Commission per converted client</Text>
          <View style={s.th}>
            <Text style={[s.cPlan, s.thText]}>Plan</Text>
            <Text style={[s.cNum, s.thText]}>Listed setup</Text>
            <Text style={[s.cNum, s.thText]}>Your floor</Text>
            <Text style={[s.cNum, s.thText]}>Max off</Text>
            <Text style={[s.cNum, s.thText]}>Commission</Text>
          </View>
          <Row plan="Nectar" listed={t.listedSetup.NECTAR} floor={t.floors.NECTAR} base={t.bases.nectar} />
          <Row plan="Honey" listed={t.listedSetup.HONEY} floor={t.floors.HONEY} base={t.bases.honey} />
          <Row plan="Hive" listed={t.listedSetup.HIVE} floor={t.floors.HIVE} base={t.bases.hive} />
          <Text style={[s.soft, { marginTop: 6 }]}>
            Flat amount per converted client, computed on collected revenue. The first $50 off the setup fee does not
            affect commission; deeper discounts reduce it proportionally (floor 50% of base).
            {recurring ? ` Recurring tail: ${t.recurringPct}% of collected monthly fees for ${t.recurringMonths} months.` : ""}
          </Text>
        </View>

        {/* Terms */}
        <View style={s.block}>
          <Text style={s.sectionLabel}>Terms</Text>

          <Clause n="1" title="Independent contractor">
            You are an independent contractor, not an employee. You control your own hours, methods, and equipment, you
            supply your own gear, you may work for others (subject to §11–§12), and you are solely responsible for your
            own taxes.
          </Clause>

          <Clause n="2" title="Your role & the funnel">
            You find local-business prospects, show them the free AI website preview, answer questions accurately,
            optionally offer an approved discount, and help them create an account and pay. You log every prospect,
            call, note, and follow-up in the portal. Funnel: Prospect added → Contacted → Preview sent → Quote sent →
            Account created → Setup paid → Converted.
          </Clause>

          <Clause n="3" title="Attribution (first touch)">
            When you add a prospect, the system locks it to you. If that prospect becomes a paying client, the
            commission is yours as the "rep of record." If a prospect already belongs to another rep, re-adding them
            does not move them to you. PageBee's records settle any dispute.
          </Clause>

          <Clause n="4" title="No authority to bind">
            You may not set pricing, waive fees, make promises, or create obligations on PageBee's behalf beyond the
            approved discount floors above.
          </Clause>

          <Clause n="5" title='When you earn a commission ("conversion")'>
            You earn the per-client commission only when all three are true: (a) the setup fee is collected, (b) the
            first monthly payment has cleared, and (c) the {t.clawbackDays}-day clawback window has passed with no
            cancel, refund, or chargeback. Until then it is only pending. Unconverted prospects, previews, quotes, and
            demos earn nothing.
          </Clause>

          <Clause n="6" title="How the amount is computed">
            Commission is a flat amount per converted client by plan (table above), computed on revenue actually
            collected. The first $50 off the setup fee does not affect your commission. Discounts deeper than $50 reduce
            your commission by the same percentage as the setup-fee discount, floored at 50% of the base.
          </Clause>

          <Clause n="7" title="Discounts you can apply">
            On your own, you may discount the setup fee only, down to your floor (above) — no monthly-fee discount.
            Anything deeper needs admin approval through the quote-approval workflow: any monthly-fee discount, any setup
            below the floor, a waived setup fee, or more than one discount on a quote. No self-approving or splitting
            discounts to get around this.
          </Clause>

          <Clause n="8" title="Clawback">
            If a new client cancels, is refunded, charges back, or fails the first monthly payment within{" "}
            {t.clawbackDays} days of the setup payment: if you haven't been paid yet, the commission is not earned; if
            you have, it's reversed and offset against future payouts (or repaid within 30 days). Partial refunds reduce
            the commission proportionally. After the window passes in good standing, that commission is locked in.
          </Clause>

          <Clause n="9" title="When you get paid">
            Commissions move Pending → Eligible (first month cleared + clawback passed) → Paid. Eligible commissions are
            paid on a recurring payout cadence — a commission earned mid-period is paid in the next scheduled run, not
            the moment it converts. You get a statement each period showing pending, eligible, paid, and clawed-back by
            client. Any transfer/platform/FX fees are yours.
            {recurring
              ? ` You also earn ${t.recurringPct}% of collected monthly fees for ${t.recurringMonths} months per client; it stops when the client cancels.`
              : ""}
          </Clause>

          <Clause n="10" title="Conduct & compliance">
            Accurate statements only — no guarantees, invented features, or unauthorized promises. Comply with
            TCPA/CAN-SPAM/Do-Not-Call and calling-hour rules; no unlawful call recording; no spam or purchased lead
            lists; no fake, self-owned, or collusive sign-ups. Breach can mean immediate termination and forfeiture of
            related unpaid commissions.
          </Clause>

          <Clause n="11" title="Confidentiality & data">
            Prospect and client data, pricing, and materials belong to PageBee and are confidential. No exporting,
            copying, or keeping lists; access ends on termination.
          </Clause>

          <Clause n="12" title="Term & termination">
            Either party may end the engagement on notice; PageBee may end it immediately for breach or suspected fraud.
            Commissions already earned past the clawback window remain payable; pending/unconverted items earn nothing.
          </Clause>
        </View>

        {/* Resources */}
        <View style={s.callout} wrap={false}>
          <Text style={s.bold}>Where to find information</Text>
          <Text style={s.soft}>
            Everything about how PageBee works — plan & pricing sheet, discount floors, how the free preview works, the
            full feature set, demo scripts, and how-tos — lives in your Resources hub: {data.resourcesUrl}
          </Text>
        </View>

        {/* Signature */}
        <View style={s.signBox} wrap={false}>
          <Text style={s.sectionLabel}>Electronic signature</Text>
          <Text style={s.para}>
            Signed electronically by <Text style={s.bold}>{data.signatoryName}</Text> on {fdate(data.signedAt)}. By
            signing, the Rep confirmed they read and agreed to this Agreement.
          </Text>
          <View style={s.signRow}>
            <Text style={s.soft}>Signatory: {data.signatoryName}</Text>
            <Text style={s.soft}>Date: {fdate(data.signedAt)}</Text>
          </View>
          <View style={s.signRow}>
            <Text style={s.soft}>Audit reference: {data.auditRef ?? "—"}</Text>
            <Text style={s.soft}>IP: {fip(data.ip)}</Text>
          </View>
        </View>
      </ThemedPage>
    </Document>
  );
}

/** Render the signed agreement to a PDF Buffer. */
export async function renderAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  const logo = await getLogoDataUrl();
  return renderToBuffer(<AgreementPdf data={data} logo={logo} />);
}

/** Filename like "Sales-Rep-Commission-Agreement.pdf". */
export function agreementPdfFilename(): string {
  return "Sales-Rep-Commission-Agreement.pdf";
}
