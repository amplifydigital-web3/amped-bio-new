/**
 * The Better Auth admin plugin (1.7) is registered on the API Better Auth
 * instance. It exposes the /auth/admin/* endpoints (set role, ban, user
 * management), every one of them gated to the "admin" role by the plugin
 * itself. The tRPC adminProcedure keeps reading users.role through the
 * session (trpc/trpc.ts hasRole), so the admin panel keeps working unchanged
 * and this test only proves the plugin is wired and reachable.
 */
import { describe, it, expect } from "vitest";
import { ADMIN_PLUGIN_DISABLED_PATHS, auth } from "../utils/auth";

describe("Better Auth admin plugin", () => {
  it("exposes the admin endpoints on the API", () => {
    const api = auth.api as unknown as Record<string, unknown>;
    for (const endpoint of ["setRole", "banUser", "unbanUser", "listUsers", "createUser"]) {
      expect(typeof api[endpoint], `auth.api.${endpoint}`).toBe("function");
    }
  });

  it("keeps the core auth endpoints intact next to the plugin", () => {
    const api = auth.api as unknown as Record<string, unknown>;
    for (const endpoint of ["signInEmail", "signUpEmail", "getSession"]) {
      expect(typeof api[endpoint], `auth.api.${endpoint}`).toBe("function");
    }
  });

  it("closes the endpoints that bypass Amped.Bio flows over HTTP", () => {
    // Better Auth answers 404 for every path in disabledPaths (router onRequest)
    expect(auth.options.disabledPaths).toEqual(ADMIN_PLUGIN_DISABLED_PATHS);
    // Each closed path is a real plugin route, so a typo cannot leave one open
    const routes = Object.values(auth.api as unknown as Record<string, { path?: string }>)
      .map(endpoint => endpoint?.path)
      .filter(Boolean);
    for (const path of ADMIN_PLUGIN_DISABLED_PATHS) expect(routes, path).toContain(path);
    // Role, ban, unban, session revoke and list stay routed for admins
    for (const path of ["/admin/set-role", "/admin/ban-user", "/admin/list-users"])
      expect(ADMIN_PLUGIN_DISABLED_PATHS).not.toContain(path);
  });
});
