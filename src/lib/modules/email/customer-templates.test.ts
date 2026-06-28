import { describe, it, expect } from "vitest";
import {
  inquiryAckEmail,
  appointmentConfirmationEmail,
  appointmentReminderEmail,
  appointmentRescheduledEmail,
  appointmentCancelledEmail,
  appointmentFollowUpEmail,
  estimateSentEmail,
  estimateExpiringEmail,
  invoiceSentEmail,
  customerPaymentReceiptEmail,
  invoiceOverdueEmail,
  statementEmail,
  reviewRequestEmail,
  winBackEmail,
  promotionEmail,
  birthdayEmail,
} from "./customer-templates";

const base = { businessName: "Bloom Salon", accent: "#b45309" };

function expectWellFormed(email: {
  subject: string;
  preheader: string;
  body: string;
  category: string;
  template: string;
}) {
  expect(email.subject.length).toBeGreaterThan(0);
  expect(email.preheader.length).toBeGreaterThan(0);
  expect(email.body.length).toBeGreaterThan(0);
  expect(email.category.length).toBeGreaterThan(0);
  expect(email.template.length).toBeGreaterThan(0);
  // Every customer email is signed off with the business name.
  expect(email.body).toContain("Bloom Salon");
}

describe("inquiryAckEmail", () => {
  it("echoes the customer's message when provided", () => {
    const email = inquiryAckEmail({ ...base, customerName: "Jo", message: "Do you do colour?" });
    expectWellFormed(email);
    expect(email.category).toBe("CUSTOMER_INQUIRY");
    expect(email.body).toContain("Do you do colour?");
  });

  it("falls back to a generic greeting without a name and omits the message panel", () => {
    const email = inquiryAckEmail({ ...base });
    expect(email.body).toContain("Hi there,");
    expect(email.body).not.toContain("Your message");
  });
});

describe("appointment lifecycle templates", () => {
  it("appointmentConfirmationEmail includes service, time and manage button", () => {
    const email = appointmentConfirmationEmail({ ...base, customerName: "Jo", serviceName: "Cut", when: "Mon 9am", manageUrl: "https://x/m" });
    expectWellFormed(email);
    expect(email.body).toContain("Cut");
    expect(email.body).toContain("Mon 9am");
    expect(email.body).toContain("https://x/m");
  });

  it("appointmentConfirmationEmail omits the manage button without a url", () => {
    const email = appointmentConfirmationEmail({ ...base, serviceName: "Cut", when: "Mon 9am" });
    expect(email.body).not.toContain("reschedule");
  });

  it("appointmentReminderEmail renders the upcoming details", () => {
    const email = appointmentReminderEmail({ ...base, serviceName: "Cut", when: "Tue 2pm", manageUrl: "https://x/m" });
    expectWellFormed(email);
    expect(email.template).toBe("customer_appointment_reminder");
    expect(email.body).toContain("Tue 2pm");
  });

  it("appointmentRescheduledEmail shows the new time", () => {
    const email = appointmentRescheduledEmail({ ...base, serviceName: "Cut", when: "Wed 3pm" });
    expectWellFormed(email);
    expect(email.body).toContain("Wed 3pm");
  });

  it("appointmentCancelledEmail offers rebooking when a url is given", () => {
    const withRebook = appointmentCancelledEmail({ ...base, serviceName: "Cut", when: "Thu", rebookUrl: "https://x/b" });
    expect(withRebook.body).toContain("https://x/b");
    const without = appointmentCancelledEmail({ ...base, serviceName: "Cut", when: "Thu" });
    expect(without.body).not.toContain("Book again");
  });

  it("appointmentFollowUpEmail thanks the customer and may invite a rebook", () => {
    const email = appointmentFollowUpEmail({ ...base, serviceName: "Cut", rebookUrl: "https://x/b" });
    expectWellFormed(email);
    expect(email.body).toContain("https://x/b");
    const without = appointmentFollowUpEmail({ ...base, serviceName: "Cut" });
    expect(without.body).not.toContain("Book your next visit");
  });
});

describe("customer billing templates", () => {
  it("estimateSentEmail renders amount and optional validity", () => {
    const email = estimateSentEmail({ ...base, number: "EST-1", amountCents: 12500, viewUrl: "https://x/v", expiresOn: "Jul 1" });
    expectWellFormed(email);
    expect(email.category).toBe("CUSTOMER_BILLING");
    expect(email.body).toContain("$125.00");
    expect(email.body).toContain("Jul 1");
  });

  it("estimateSentEmail formats non-USD currency", () => {
    const email = estimateSentEmail({ ...base, currency: "EUR", number: "EST-1", amountCents: 10000, viewUrl: "https://x/v" });
    expect(email.body).not.toContain("$100.00");
  });

  it("estimateExpiringEmail states the expiry date", () => {
    const email = estimateExpiringEmail({ ...base, number: "EST-1", viewUrl: "https://x/v", expiresOn: "Jul 1" });
    expectWellFormed(email);
    expect(email.body).toContain("Jul 1");
  });

  it("invoiceSentEmail renders amount and optional due date", () => {
    const withDue = invoiceSentEmail({ ...base, number: "INV-1", amountCents: 5000, dueOn: "Jul 5", viewUrl: "https://x/v" });
    expect(withDue.body).toContain("$50.00");
    expect(withDue.body).toContain("Jul 5");
    const without = invoiceSentEmail({ ...base, number: "INV-1", amountCents: 5000, viewUrl: "https://x/v" });
    expect(without.body).not.toContain("Due date");
  });

  it("customerPaymentReceiptEmail shows the paid amount and date", () => {
    const email = customerPaymentReceiptEmail({ ...base, number: "INV-1", amountCents: 5000, when: "Today", viewUrl: "https://x/v" });
    expectWellFormed(email);
    expect(email.body).toContain("$50.00");
    expect(email.body).toContain("Today");
  });

  it("invoiceOverdueEmail names the due date", () => {
    const email = invoiceOverdueEmail({ ...base, number: "INV-1", amountCents: 5000, dueOn: "Jun 1", viewUrl: "https://x/v" });
    expectWellFormed(email);
    expect(email.body).toContain("Jun 1");
  });

  it("statementEmail renders the period and balance", () => {
    const email = statementEmail({ ...base, period: "June 2026", balanceCents: 7500, viewUrl: "https://x/v" });
    expectWellFormed(email);
    expect(email.body).toContain("June 2026");
    expect(email.body).toContain("$75.00");
  });
});

describe("review and marketing templates", () => {
  it("reviewRequestEmail personalises the subject", () => {
    const email = reviewRequestEmail({ ...base, customerName: "Jo Bloggs", reviewUrl: "https://x/r", serviceName: "Cut" });
    expectWellFormed(email);
    expect(email.subject).toContain("Jo");
    expect(email.body).toContain("Cut");
  });

  it("reviewRequestEmail falls back to 'there' without a name", () => {
    const email = reviewRequestEmail({ ...base, reviewUrl: "https://x/r" });
    expect(email.subject).toContain("there");
  });

  it("winBackEmail shows the offer panel when given", () => {
    const withOffer = winBackEmail({ ...base, offer: "20% off", ctaUrl: "https://x/c" });
    expect(withOffer.category).toBe("CUSTOMER_MARKETING");
    expect(withOffer.body).toContain("20% off");
    const without = winBackEmail({ ...base, ctaUrl: "https://x/c" });
    expect(without.body).not.toContain("Just for you");
  });

  it("promotionEmail uses the headline as subject", () => {
    const email = promotionEmail({ ...base, headline: "Summer Sale", details: "Everything must go", ctaLabel: "Shop", ctaUrl: "https://x/c" });
    expectWellFormed(email);
    expect(email.subject).toContain("Summer Sale");
    expect(email.body).toContain("Everything must go");
  });

  it("birthdayEmail includes the gift offer when present", () => {
    const email = birthdayEmail({ ...base, offer: "Free dessert", ctaUrl: "https://x/c" });
    expectWellFormed(email);
    expect(email.body).toContain("Free dessert");
    const without = birthdayEmail({ ...base, ctaUrl: "https://x/c" });
    expect(without.body).not.toContain("Our gift to you");
  });
});
