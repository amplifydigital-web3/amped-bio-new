import { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../../../../server/src/trpc";
import { mockData } from "./mock-data";
import { AUTH_STORAGE_KEYS } from "../../../../constants/auth-storage";

const mockDelay = () => new Promise(resolve => setTimeout(resolve, 500));

// Persistent state for users
const mockUsers = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
];

/**
 * Mock requester to simulate backend responses
 */
const mockRequester = async (opts: { type: string; path: string; input: any }) => {
  const { type, path, input } = opts;

  console.log(`[MOCK] Starting mockRequester for ${path}`, { type, input });

  // Simulate network latency
  console.log(`[MOCK] Simulating network delay (500ms) for ${path}`);
  await mockDelay();
  console.log(`[MOCK] Network delay completed for ${path}`);

  const [namespace, procedure] = path.split(".");
  console.log(`[MOCK] Parsed path into namespace: "${namespace}", procedure: "${procedure}"`);

  console.log(`[DEMO MODE] TRPC ${path} called with:`, input);

  // Handle authentication-related operations
  if (path === "auth.login") {
    console.log("[MOCK] Processing auth.login, storing demo token");
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, "demo-auth-token");
  } else if (path === "auth.register") {
    console.log("[MOCK] Processing auth.register, storing demo token");
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, "demo-auth-token");
  } else if (path === "auth.logout") {
    console.log("[MOCK] Processing auth.logout, removing token");
    localStorage.removeItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
  }

  let result;

  // Handle user-related operations dynamically
  if (path === "user.getUsers") {
    console.log(`[MOCK] Processing user.getUsers, returning ${mockUsers.length} users`);
    result = mockUsers;
    console.log(`[DEMO MODE] Responding with mock users for ${path}`);
  } else if (path === "user.addUser") {
    console.log("[MOCK] Processing user.addUser with data:", input);
    const newUser = {
      id: mockUsers.length + 1,
      name: (input as any).name,
      email: (input as any).email,
    };
    mockUsers.push(newUser);
    result = newUser;
    console.log(`[MOCK] New user added, total users: ${mockUsers.length}`);
    console.log(`[DEMO MODE] Added user for ${path}:`, newUser);
  } else if (namespace && procedure && mockData[namespace]?.[procedure]) {
    // Deep clone to avoid modifying the original mock data
    console.log(`[MOCK] Found mock data for ${namespace}.${procedure}, creating deep clone`);
    result = JSON.parse(JSON.stringify(mockData[namespace][procedure]));

    // Special handling for certain endpoints
    if (path === "onelink.getOnelink" && input && typeof input === "object" && "onelink" in input) {
      console.log("[MOCK] Customizing onelink response for input:", input);
      // Customize onelink response based on input
      if (input.onelink !== "demo-user") {
        console.log(`[MOCK] Changing user name to: ${input.onelink}`);
        result.user.name = input.onelink;
      }
    }

    console.log(`[DEMO MODE] Responding with mock data for ${path}`, result);
  } else {
    // Generic success response if specific mock not found
    console.log(`[MOCK] No specific handler found for ${path}, using generic response`);
    result = { success: true, message: `Mock operation successful for ${path}` };
    console.log(`[DEMO MODE] No specific mock found for ${path}, sending generic success`);
  }

  console.log(`[MOCK] Completed processing for ${path}, returning result:`, result);
  return {
    result: {
      data: result,
    },
    meta: undefined,
  };
};

/**
 * Creates a mock TRPC link for demonstration and testing purposes.
 * This allows the application to function without a real backend in DEMO mode.
 * @see https://trpc.io/docs/client/links/httpLink
 */
export function mockLink(): TRPCLink<AppRouter> {
  console.log("[MOCK] Creating mockLink");
  return () => {
    console.log("[MOCK] mockLink initialized and waiting for operations");
    return ({ op }) => {
      console.log("[MOCK] mockLink received operation:", op);
      return observable(observer => {
        const { path, input, type } = op;
        console.log(`[MOCK] Creating observable for ${path}`, { type, input });

        // Throw error for subscriptions (not supported in mockLink)
        if (type === "subscription") {
          console.error(`[MOCK] Subscription not supported for ${path}`);
          throw new Error(
            "Subscriptions are unsupported by mockLink - use httpSubscriptionLink or wsLink"
          );
        }

        console.log(`[MOCK] Calling mockRequester for ${path}`);
        mockRequester({ type, path, input })
          .then(({ result, meta }) => {
            console.log(`[MOCK] mockRequester completed successfully for ${path}`);
            console.log("[MOCK] Emitting next event with result:", result);
            // Match the http-link response format by adding a 'result' property
            observer.next({
              context: meta,
              result,
            });
            console.log(`[MOCK] Completing observable for ${path}`);
            observer.complete();
          })
          .catch(cause => {
            console.error(`[MOCK] Error in mockRequester for ${path}:`, cause);
            observer.error(cause);
          });

        console.log(`[MOCK] Observable setup complete for ${path}, waiting for async completion`);
        return () => {
          console.log(`[MOCK] Observable cleanup for ${path}`);
        };
      });
    };
  };
}
