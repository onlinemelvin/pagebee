import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "../legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How PageBee collects, uses, and protects your information — including our SMS messaging and mobile opt-in practices.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="June 26, 2026">
      <p>
        This Privacy Policy explains how PageBee (&ldquo;PageBee,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;) collects, uses, and protects information when you use our website-building,
        hosting, and business-management platform (the &ldquo;Service&rdquo;). By using the Service you
        agree to the practices described here.
      </p>

      <Section heading="Information we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Account information</strong> — your name, business name, email address, and mobile phone number.</li>
          <li><strong>Content you provide</strong> — business details, media, services, and customer records you enter.</li>
          <li><strong>Usage data</strong> — how you interact with the Service, device and log information.</li>
          <li><strong>Payment information</strong> — processed by our payment provider (Stripe); we never store full card or bank numbers.</li>
        </ul>
      </Section>

      <Section heading="How we use your information">
        <p>We use your information to provide, maintain, and improve the Service; to process payments;
        to send you account, transactional, and service notifications (including by email and SMS where
        you have opted in); to provide support; and to comply with legal obligations.</p>
      </Section>

      <Section heading="SMS / text messaging and mobile opt-in">
        <p>
          If you opt in to text (SMS) alerts in your account settings, we send you automated
          transactional notifications about your business activity — such as new leads and booking
          requests — at the mobile number you provide. Message frequency varies based on your activity.
          Message and data rates may apply. You can opt out at any time by replying{" "}
          <strong>STOP</strong> to any message, or reply <strong>HELP</strong> for assistance.
        </p>
        <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          <strong>We do not sell, rent, or share your mobile phone number or SMS opt-in information with
          any third parties for their marketing purposes.</strong> Mobile opt-in data and consent are
          used solely to deliver the alerts you have enabled, and are never shared with third parties or
          affiliates for marketing or promotional purposes. We only share your number with our SMS
          delivery provider (Twilio) strictly to transmit the messages you requested.
        </p>
      </Section>

      <Section heading="How we share information">
        <p>We share information only with service providers that help us operate the Service (such as
        hosting, payments, email, and SMS delivery), and only as needed to provide the Service; when
        required by law; or to protect our rights. We do not sell your personal information.</p>
      </Section>

      <Section heading="Data retention &amp; security">
        <p>We retain information for as long as your account is active or as needed to provide the
        Service and meet legal obligations. We use reasonable technical and organizational measures to
        protect your information, though no method of transmission or storage is completely secure.</p>
      </Section>

      <Section heading="Your choices">
        <p>You can update your account information, manage email and SMS notification preferences, or
        request deletion of your account at any time from your dashboard or by contacting us.</p>
      </Section>

      <Section heading="Contact us">
        <p>
          Questions about this policy? Email us at{" "}
          <a href="mailto:privacy@pagebee.com" className="font-medium text-amber-700 hover:text-amber-800 underline">privacy@pagebee.com</a>.
          See also our{" "}
          <Link href="/terms" className="font-medium text-amber-700 hover:text-amber-800 underline">Terms of Service</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
