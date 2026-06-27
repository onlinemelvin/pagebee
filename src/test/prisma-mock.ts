import { vi } from "vitest";

/**
 * A dependency-free deep mock of the Prisma client. Every model delegate
 * (`prisma.lead`, `prisma.client`, …) and every method on it (`.create`,
 * `.findFirst`, …) is lazily materialised as a `vi.fn()` the first time it's
 * touched, so tests only configure the calls they care about:
 *
 *   prismaMock.lead.create.mockResolvedValue({ id: "l1" });
 *
 * `$transaction` is supported in both forms:
 *   - array form  → resolves all promises (Promise.all)
 *   - callback form → invokes the callback with the same mock (interactive tx)
 */
export type PrismaMock = Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
};

export function createPrismaMock(): PrismaMock {
  const delegates = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();

  const makeDelegate = () =>
    new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get(target, method: string | symbol) {
        if (typeof method === "symbol") return Reflect.get(target, method);
        if (!target[method]) target[method] = vi.fn();
        return target[method];
      },
    });

  const proxy: PrismaMock = new Proxy({} as PrismaMock, {
    get(target, prop: string | symbol) {
      if (typeof prop === "symbol") return Reflect.get(target, prop);
      // Not a thenable — guard against accidental `await prisma`.
      if (prop === "then") return undefined;
      if (prop === "$transaction") {
        const existing = Reflect.get(target, prop) as ReturnType<typeof vi.fn> | undefined;
        if (existing) return existing;
        const fn = vi.fn(async (arg: unknown) =>
          Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: PrismaMock) => unknown)(proxy),
        );
        Reflect.set(target, prop, fn);
        return fn;
      }
      if (prop === "$queryRaw" || prop === "$executeRaw" || prop === "$connect" || prop === "$disconnect") {
        const existing = Reflect.get(target, prop) as ReturnType<typeof vi.fn> | undefined;
        if (existing) return existing;
        const fn = vi.fn();
        Reflect.set(target, prop, fn);
        return fn;
      }
      if (!delegates.has(prop)) delegates.set(prop, makeDelegate());
      return delegates.get(prop)!;
    },
  });

  return proxy;
}
