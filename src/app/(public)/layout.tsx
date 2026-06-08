import Link from "next/link";
import { Button } from "@/components/ui/button";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-lg">🐝</span>
      <span className="font-display text-xl font-semibold tracking-tight text-stone-900">PageBee</span>
    </Link>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[var(--background)]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm font-medium text-stone-600 sm:flex">
            <Link href="/#features" className="hover:text-stone-900">Features</Link>
            <Link href="/pricing" className="hover:text-stone-900">Pricing</Link>
            <Link href="/#contact" className="hover:text-stone-900">Contact</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/pricing">
              <Button variant="ghost" size="sm">Pricing</Button>
            </Link>
            <Link href="/#contact">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-stone-500 sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} PageBee. Built, hosted & automated for local businesses.</p>
        </div>
      </footer>
    </>
  );
}
