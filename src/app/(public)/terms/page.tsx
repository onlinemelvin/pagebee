import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "../legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing your use of PageBee, including billing, acceptable use, and SMS messaging terms.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="June 26, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the PageBee platform and
        services (the &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to
        these Terms.
      </p>

      <Section heading="The Service">
        <p>PageBee builds, hosts, and helps you operate a website and related business tools (leads,
        booking, chat, invoices, payments, and notifications). Available features depend on your chosen
        plan.</p>
      </Section>

      <Section heading="Accounts">
        <p>You are responsible for the accuracy of the information you provide, for activity under your
        account, and for keeping your credentials secure. You must be authorized to act on behalf of the
        business you register.</p>
      </Section>

      <Section heading="Billing">
        <p>Paid plans are billed in advance on a recurring basis, plus any one-time setup fee shown at
        purchase. Fees are non-refundable except where required by law. You can manage or cancel your
        plan from your dashboard; cancellation takes effect at the end of the current billing period.</p>
      </Section>

      <Section heading="SMS / text messaging terms">
        <p>
          If you opt in to text (SMS) alerts, you agree to receive automated transactional SMS messages
          from PageBee about your business activity, such as new leads and booking requests, at the
          mobile number you provide. Consent to receive these messages is not a condition of purchasing
          any goods or services.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Message frequency</strong> varies based on your business activity.</li>
          <li><strong>Message and data rates may apply</strong> per your mobile carrier plan.</li>
          <li>Reply <strong>STOP</strong> to any message to cancel. Reply <strong>HELP</strong> for help.</li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
        </ul>
        <p>
          How we handle your mobile number and opt-in data is described in our{" "}
          <Link href="/privacy" className="font-medium text-amber-700 hover:text-amber-800 underline">Privacy Policy</Link>.
          We do not sell or share your mobile information with third parties for marketing.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You may not use the Service for unlawful, harmful, deceptive, or abusive purposes, including
        sending unsolicited messages, infringing others&rsquo; rights, or attempting to disrupt the
        Service. We may suspend or terminate accounts that violate these Terms.</p>
      </Section>

      <Section heading="Disclaimers &amp; limitation of liability">
        <p>The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum
        extent permitted by law, PageBee is not liable for indirect, incidental, or consequential
        damages, and our total liability is limited to the amounts you paid us in the 12 months before
        the claim.</p>
      </Section>

      <Section heading="Changes">
        <p>We may update these Terms from time to time. Material changes will be communicated through the
        Service or by email. Continued use after changes take effect constitutes acceptance.</p>
      </Section>

      <Section heading="Contact us">
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:support@pagebee.com" className="font-medium text-amber-700 hover:text-amber-800 underline">support@pagebee.com</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
