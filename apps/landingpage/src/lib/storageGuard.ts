/**
 * QA-010: some browsers block site storage (all site data blocked, sandboxed
 * iframes, strict privacy modes). Reading window.localStorage then throws a
 * SecurityError. Our own code guards every access, but third party modules
 * read it at import time (the MetaMask SDK pulled in by Web3Auth does
 * `window.localStorage` at module scope), and one throw at import crashes the
 * whole app into the global error page.
 *
 * When an accessor throws, this swaps in an in-memory Storage for the page
 * view, so storage-backed extras (theme, consent memory, motion pause)
 * degrade and the page renders. indexedDB becomes undefined, which libraries
 * already treat as unsupported.
 *
 * It must stay self-contained: the root layout inlines its source in <head>
 * so it runs before any app chunk, and AppProviders also calls it on import
 * for the error and not-found shells, where the layout head streams late.
 */
export function installStorageGuard() {
  // Not `typeof window`: the server build folds that check to a constant and
  // strips the body from the inlined source
  const win = globalThis as unknown as Window;
  if (!("document" in win)) return;
  const memory = (): Storage => {
    let data: Record<string, string> = {};
    return {
      get length() {
        return Object.keys(data).length;
      },
      key: (index: number) => Object.keys(data)[index] ?? null,
      getItem: (key: string) =>
        Object.prototype.hasOwnProperty.call(data, String(key)) ? data[String(key)] : null,
      setItem: (key: string, value: string) => {
        data[String(key)] = String(value);
      },
      removeItem: (key: string) => {
        delete data[String(key)];
      },
      clear: () => {
        data = {};
      },
    };
  };
  const guard = (
    name: "localStorage" | "sessionStorage" | "indexedDB",
    fallback: () => unknown
  ) => {
    try {
      const store = win[name];
      if (name !== "indexedDB") {
        const probe = "__amped_probe__";
        (store as Storage).setItem(probe, probe);
        (store as Storage).removeItem(probe);
      }
    } catch {
      try {
        Object.defineProperty(win, name, {
          configurable: true,
          enumerable: true,
          value: fallback(),
        });
      } catch {
        // Not redefinable here: nothing more we can do
      }
    }
  };
  guard("localStorage", memory);
  guard("sessionStorage", memory);
  guard("indexedDB", () => undefined);
}

export const STORAGE_GUARD_SNIPPET = `(${installStorageGuard.toString()})();`;
