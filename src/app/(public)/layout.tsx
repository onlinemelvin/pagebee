import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/Logo";

function Logo() {
  return <BrandLogo href="/" size={32} textClassName="text-xl" priority />;
}

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#contact", label: "Contact" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[var(--background)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm font-medium text-stone-600 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group relative py-1 transition-colors hover:text-stone-900"
              >
                {item.label}
                <span className="absolute -bottom-0.5 left-0 h-0.5 w-0 rounded-full bg-amber-400 transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="group">
                Get started
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <Logo />
              <p className="mt-4 max-w-xs text-sm text-stone-500">
                Websites built, hosted, and automated for local businesses — without the agency bill.
              </p>
            </div>
            <FooterCol
              title="Product"
              links={[
                { href: "/#features", label: "Features" },
                { href: "/pricing", label: "Pricing" },
                { href: "/register", label: "Get a free preview" },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { href: "/#contact", label: "Contact" },
                { href: "/login", label: "Sign in" },
                { href: "/privacy", label: "Privacy Policy" },
                { href: "/terms", label: "Terms of Service" },
              ]}
            />
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Ready to start?</h3>
              <p className="mt-3 text-sm text-stone-500">See your new website free — no card required.</p>
              <Link href="/register" className="mt-4 inline-block">
                <Button size="sm">Get my free preview</Button>
              </Link>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-stone-200 pt-6 text-sm text-stone-500 sm:flex-row">
            <p>© {new Date().getFullYear()} PageBee. Built, hosted &amp; automated for local businesses.</p>
            <p className="text-xs">Made with care 🐝</p>
          </div>
        </div>
      </footer>
    </>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-stone-500">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="transition-colors hover:text-amber-700">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
