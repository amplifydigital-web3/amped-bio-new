# Two-Factor Authentication (2FA) Implementation Plan

## 1. Overview & Architecture Decision

**Chosen approach**: Use **better-auth's native `twoFactor` plugin** (v1.4.7+) which supports:
- **TOTP** (Google Authenticator, Authy, etc.) — time-based codes via authenticator apps
- **OTP** (email-based) — one-time codes sent via email (optional fallback)
- **Backup codes** — recovery codes for when the user loses their device
- **Trusted devices** — skip 2FA for 30 days on trusted devices

This is ideal because:
- The project already uses `better-auth` v1.4.7 as its auth core
- The `twoFactor` plugin auto-adds `twoFactorEnabled` to the `User` model and creates a `twoFactor` table via Prisma adapter
- Client-side helpers via `twoFactorClient` from `better-auth/client/plugins`
- Zero additional OTP-generation dependencies needed
- Plugin handles QR generation (returns `totpURI`), code verification, and backup codes natively
- Built-in rate limiting and secret encryption

---

## 2. Phase 1 — Database & Prisma Schema

### 2.1 Migration

The `twoFactor` plugin requires these schema changes (auto-generated via `npx auth migrate` or `npx auth generate`):

**User table** — adds one field:
```
twoFactorEnabled  Boolean  (default: false)
```

**twoFactor table** — new table:
| Field | Type | Description |
|---|---|---|
| id | String (PK) | Unique ID |
| userId | String (FK → User) | The user |
| secret | String | Encrypted TOTP secret |
| backupCodes | String | Encrypted hashed backup codes |
| verified | Boolean | Whether TOTP secret was verified during enrollment |

**Action**: Run `pnpm --filter server exec npx auth migrate` after configuring the plugin.

### 2.2 Schema changes in Prisma

The plugin adds these automatically to `schema.prisma`:
```prisma
model User {
  // ... existing fields
  twoFactorEnabled Boolean @default(false)
}

model TwoFactor {
  id           String  @id
  userId       String
  secret       String
  backupCodes  String
  verified     Boolean
  user         User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 3. Phase 2 — Server-Side Implementation

### 3.1 `apps/server/src/utils/auth.ts` — Enable TwoFactor plugin

**Add import:**
```typescript
import { twoFactor } from "better-auth/plugins";
```

**Add to plugins array** in `betterAuth()` config:
```typescript
twoFactor({
  issuer: "Amped.Bio",              // App name shown in authenticator apps
  skipVerificationOnEnable: false,  // Require TOTP code verification before enabling
  totpOptions: {
    digits: 6,                      // 6-digit TOTP codes
    period: 30,                     // 30-second window
  },
  backupCodeOptions: {
    amount: 10,                     // Generate 10 backup codes
  },
  // Optional: OTP (email-based) support
  // otpOptions: {
  //   async sendOTP({ user, otp }, ctx) {
  //     await sendTwoFactorOTPEmail(user.email, otp);
  //   },
  // },
})
```

### 3.2 `apps/server/src/env.ts` — No new env vars needed
The twoFactor plugin uses existing encryption infrastructure from better-auth.

### 3.3 `apps/server/src/trpc/user.ts` — New 2FA tRPC endpoints

Add to `userRouter`:

| Procedure | Type | Schema | Purpose |
|---|---|---|---|
| `getTwoFactorStatus` | query (private) | none | Returns `{ twoFactorEnabled: boolean }` for current user |
| `enableTwoFactor` | mutation (private) | `{ password: string }` | Calls `auth.api.enableTwoFactor`, returns `{ totpURI, backupCodes }` |
| `verifyTotp` | mutation (private) | `{ code: string }` | Calls `auth.api.verifyTOTP` to finalize 2FA setup or verify during login challenge |
| `disableTwoFactor` | mutation (private) | `{ password: string }` | Calls `auth.api.disableTwoFactor` |
| `generateBackupCodes` | mutation (private) | `{ password: string }` | Calls `auth.api.generateBackupCodes`, returns new set |
| `getTotpUri` | mutation (private) | `{ password: string }` | Calls `auth.api.getTOTPURI`, returns `{ totpURI }` to display QR again |

**Implementation pattern** (follows existing `initiateEmailChange` style):

```typescript
// Import auth from utils
import { auth } from "../utils/auth";

// In userRouter:
enableTwoFactor: privateProcedure
  .input(z.object({ password: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const result = await auth.api.enableTwoFactor({
      body: { password: input.password },
      headers: ctx.req.headers as any,
    });
    return result; // { totpURI: string, backupCodes: string[] }
  }),

verifyTotp: privateProcedure
  .input(z.object({ code: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const result = await auth.api.verifyTOTP({
      body: { code: input.code },
      headers: ctx.req.headers as any,
    });
    return result; // { user, token }
  }),

disableTwoFactor: privateProcedure
  .input(z.object({ password: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const result = await auth.api.disableTwoFactor({
      body: { password: input.password },
      headers: ctx.req.headers as any,
    });
    return result; // { status: boolean }
  }),

generateBackupCodes: privateProcedure
  .input(z.object({ password: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const result = await auth.api.generateBackupCodes({
      body: { password: input.password },
      headers: ctx.req.headers as any,
    });
    return result; // { status: boolean, backupCodes: string[] }
  }),

getTotpUri: privateProcedure
  .input(z.object({ password: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const result = await auth.api.getTOTPURI({
      body: { password: input.password },
      headers: ctx.req.headers as any,
    });
    return result; // { totpURI: string }
  }),

getTwoFactorStatus: privateProcedure
  .query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user!.sub },
      select: { twoFactorEnabled: true },
    });
    return { twoFactorEnabled: user?.twoFactorEnabled ?? false };
  }),
```

### 3.4 `apps/server/src/trpc/auth.ts` — Update `me` query

Add `twoFactorEnabled` to the returned user object:
```typescript
// In authRouter.me:
twoFactorEnabled: (user as any).twoFactorEnabled || false,
```

### 3.5 `apps/server/src/trpc/auth.ts` — Update wallet token JWT

Add `twoFactorEnabled` to the JWT payload in `getWalletToken`:
```typescript
twoFactorEnabled: (session.user as any).twoFactorEnabled || false,
```

---

## 4. Phase 3 — Login Flow Changes

### 4.1 How 2FA intercepts sign-in

When a user with `twoFactorEnabled: true` signs in via email/password:
- better-auth's `twoFactor` plugin **automatically intercepts** the sign-in response
- The response contains `twoFactorRedirect: true` and `twoFactorMethods: ["totp"]` (or `["totp", "otp"]`)
- **No session is created** — `ctx.context.newSession` is reset to `null`
- The user must verify the second factor before a session is established

### 4.2 Client-side `twoFactorClient` initialization

In `apps/client/src/lib/auth-client.ts`:
```typescript
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
  plugins: [
    twoFactorClient({
      twoFactorPage: "/auth/two-factor",
      // Or use the callback approach:
      // onTwoFactorRedirect({ twoFactorMethods }) {
      //   window.location.href = "/auth/two-factor";
      // },
    }),
  ],
});
```

**Two approaches for redirect**:
- `twoFactorPage: "/auth/two-factor"` — causes full page reload to the specified route (simplest)
- `onTwoFactorRedirect({ twoFactorMethods })` — callback for programmatic redirect without page reload

**AuthModal update**: The `onSubmitLogin` handler already uses `authClient.signIn.email()`. When 2FA is enabled, the response will trigger the `twoFactorPage` redirect automatically. No changes needed to the login form itself.

### 4.3 New page: `apps/client/src/pages/auth/TwoFactorChallenge.tsx`

A dedicated page for entering the 2FA code during login:

**Features:**
- Displays a 6-digit OTP input (using existing `input-otp` shadcn component)
- Calls `authClient.twoFactor.verifyTotp({ code })` on submit
- Shows "Use backup code instead" toggle/link for recovery
- Backup code flow: calls `authClient.twoFactor.verifyBackupCode({ code })`
- "Trust this device for 30 days" checkbox (passes `trustDevice: true`)
- Error handling: invalid code, rate limited, expired code
- On success: redirects to home or original destination

### 4.4 Route registration

In `apps/client/src/App.tsx`, add:
```
/auth/two-factor → TwoFactorChallenge page (public route)
```

### 4.5 AuthContext updates

Add to `AuthContextType` and state:
```typescript
type AuthContextType = {
  // ... existing fields
  twoFactorPending: boolean;  // NEW: true when login requires 2FA challenge
};
```

---

## 5. Phase 4 — User Dashboard (Settings Panel)

### 5.1 New component: `SecurityTabContent.tsx`

Location: `apps/client/src/components/panels/profile/SecurityTabContent.tsx`

This is the **main user-facing 2FA configuration panel**. It handles three states:

**State A: 2FA Disabled**
```
┌──────────────────────────────────────────┐
│ 🔒 Two-Factor Authentication             │
│                                          │
│ Add an extra layer of security to your   │
│ account by enabling two-factor           │
│ authentication.                          │
│                                          │
│ [Enable Two-Factor Authentication]       │
└──────────────────────────────────────────┘
```

**State B: Setup In Progress** (after clicking "Enable")
```
┌──────────────────────────────────────────┐
│ Step 1: Scan QR Code                     │
│ ┌────────────┐                           │
│ │  QR CODE   │ ← qrcode.react component  │
│ └────────────┘                           │
│ Or enter manually: JBSWY3DPEHPK3PXP...   │
│                                          │
│ Step 2: Enter 6-digit code to verify     │
│ ┌─┬─┬─┬─┬─┬─┐                            │
│ │ │ │ │ │ │ │ │  ← input-otp component   │
│ └─┴─┴─┴─┴─┴─┘                            │
│                                          │
│ [Cancel]                    [Verify]     │
└──────────────────────────────────────────┘
```

**State C: 2FA Enabled**
```
┌──────────────────────────────────────────┐
│ 🔒 Two-Factor Authentication  ✓ ENABLED  │
│                                          │
│ Your account is protected with TOTP      │
│ two-factor authentication.               │
│                                          │
│ [View Backup Codes]  [Regenerate Codes]  │
│ [Disable Two-Factor Authentication]      │
└──────────────────────────────────────────┘
```

**Backup codes display** (dialog/modal):
```
┌──────────────────────────────────────────┐
│ Backup Codes                             │
│                                          │
│ Store these in a safe place. Each code   │
│ can only be used once.                   │
│                                          │
│ 1. A1B2-C3D4                             │
│ 2. E5F6-G7H8                             │
│ ... (10 codes)                           │
│                                          │
│ [Download as TXT]  [Copy All]  [Close]   │
└──────────────────────────────────────────┘
```

**Disable confirmation dialog:**
```
┌──────────────────────────────────────────┐
│ Disable Two-Factor Authentication?       │
│                                          │
│ This will remove an important security   │
│ layer from your account.                 │
│                                          │
│ Password: [________________]             │
│                                          │
│ [Cancel]              [Confirm Disable]  │
└──────────────────────────────────────────┘
```

### 5.2 Add "Security" tab to ProfilePanel

In `ProfilePanel.tsx`:
```tsx
// Add new tab button:
<button
  className={`px-3 py-2 text-sm font-medium rounded-md ${
    activeTab === "security"
      ? "bg-gray-100 text-gray-900"
      : "text-gray-500 hover:text-gray-700"
  }`}
  onClick={() => setActiveTab("security")}
>
  Security
</button>

// Add new tab content:
{activeTab === "security" && <SecurityTabContent />}
```

### 5.3 Data flow

```
SecurityTabContent
  ├─ useQuery('user.getTwoFactorStatus')
  │    → { twoFactorEnabled: boolean }
  │
  ├─ Enable flow:
  │   ├─ useMutation('user.enableTwoFactor') 
  │   │    → { totpURI, backupCodes }
  │   ├─ Store backupCodes in state for display
  │   ├─ Render QR code from totpURI (qrcode.react)
  │   ├─ User enters 6-digit code from authenticator app
  │   └─ useMutation('user.verifyTotp') 
  │        → success (twoFactorEnabled becomes true)
  │
  ├─ Disable flow:
  │   ├─ Show confirmation dialog with password input
  │   └─ useMutation('user.disableTwoFactor') 
  │        → success
  │
  └─ Backup codes flow:
      ├─ useMutation('user.generateBackupCodes') 
      │    → new codes (old ones are invalidated)
      └─ Display in BackupCodesDialog
```

---

## 6. Phase 5 — Shared Types & Constants

### 6.1 `apps/client/src/types/auth.ts`
```typescript
export type AuthUser = {
  id: number;
  email: string;
  handle: string;
  role: string;
  image: string | null;
  wallet: string | null;
  poolAddresses: Record<string, string>;
  twoFactorEnabled: boolean;  // ADD
};
```

### 6.2 `packages/constants/src/index.ts`
Add new export for 2FA-related constants if needed:
```typescript
export * from "./twoFactor";
```

Create `packages/constants/src/twoFactor.ts`:
```typescript
export const TWO_FACTOR_BACKUP_CODE_COUNT = 10;
export const TWO_FACTOR_TRUST_DEVICE_DAYS = 30;
```

---

## 7. Phase 6 — UI/UX Polish

### 7.1 Components to create
| Component | Location | Purpose |
|---|---|---|
| `SecurityTabContent.tsx` | `components/panels/profile/` | Main 2FA settings panel |
| `TwoFactorChallenge.tsx` | `pages/auth/` | Login-time 2FA code entry |
| `BackupCodesDialog.tsx` | `components/dialogs/` | Backup codes display/management modal |

### 7.2 Existing reusable components to leverage
- `input-otp` (already installed) — OTP code input
- `qrcode.react` (already installed) — QR code for `totpURI`
- `Button`, `Input`, `Dialog`, `Card`, `Label` from `ui/`
- `sonner` toasts for success/error notifications
- `Shield` icon from `lucide-react` for the Security tab

### 7.3 States to handle
- **Loading**: Skeleton placeholders during API calls
- **Error**: Red alert banners with specific messages (invalid code, rate limited, wrong password)
- **Success**: Green confirmation with sonner toast
- **Email not verified**: Warn user to verify email before enabling 2FA
- **Rate limited**: Show countdown timer (better-auth built-in rate limiting)

---

## 8. Phase 7 — Email Notifications (if adding OTP support)

### 8.1 Email templates

| Template | Purpose |
|---|---|
| `TwoFactorEnabledTemplate.tsx` | Confirms 2FA has been enabled |
| `TwoFactorDisabledTemplate.tsx` | Warns 2FA has been disabled |
| `TwoFactorOTPTemplate.tsx` | Sends the OTP code (only if using email-based 2FA) |

### 8.2 Server-side email triggers

In `apps/server/src/utils/email/email.ts`:
```typescript
export const sendTwoFactorEnabledEmail = async (email: string) => { /* ... */ }
export const sendTwoFactorDisabledEmail = async (email: string) => { /* ... */ }
// Only if using OTP:
export const sendTwoFactorOTPEmail = async (email: string, otp: string) => { /* ... */ }
```

These fire after successful tRPC mutations (non-blocking, fire-and-forget pattern).

---

## 9. Phase 8 — Rate Limiting & Security

### 9.1 Already handled by better-auth's twoFactor plugin
- **Rate limiting**: Built-in on `/two-factor/verify-totp` (too many attempts → request new code)
- **Secret encryption**: `secret` and `backupCodes` stored encrypted at rest
- **Password re-verification**: All enable/disable/regenerate endpoints require current password
- **TOTP drift**: Accepts 1 period before/after current (standard practice)

### 9.2 Additional measures
- **reCAPTCHA on disable**: Add reCAPTCHA to the disable flow for extra security
- **Audit logging**: Log all 2FA events (enable, disable, code regen) as structured console logs

---

## 10. Phase 9 — Testing Strategy

### 10.1 Unit Tests
- `SecurityTabContent.test.tsx`: Renders all 3 states, enable/disable flows
- `TwoFactorChallenge.test.tsx`: OTP entry, backup code fallback, error states

### 10.2 Integration Tests
- tRPC endpoint tests for 2FA procedures
- Auth flow: login → 2FA challenge → verify → session established

### 10.3 E2E (Cypress)
- Full enable flow: Profile → Security → Enable → Scan QR → Verify → Confirm
- Full disable flow: Profile → Security → Disable → Password → Confirm
- Login with 2FA: Login → Enter code → Success redirect

---

## 11. Phase 10 — Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User enables 2FA but loses authenticator app | Backup codes (shown during setup, available in panel) |
| User loses all backup codes | Must contact support (admin can disable 2FA via admin panel) |
| User tries to enable when email not verified | Show error: "Verify your email first" |
| Rate limited on code entry | Show countdown; better-auth built-in error message |
| Session expires during 2FA setup | Redirect to login |
| QR scan fails | Show manual entry field with TOTP secret text |
| Network error during verification | Retry button with error details |
| Wrong password in enable/disable | Show "Invalid password" error (from better-auth) |
| User abandons 2FA setup midway | Reset setup state on component unmount |
| Backup code already used | better-auth removes used codes; returns error for reuse |

---

## 12. Implementation Order

```
Step 1:  Server plugin + migration       (1-2 hours)
          - Add twoFactor to plugins array in auth.ts
          - Run npx auth migrate
          - Verify schema changes

Step 2:  tRPC endpoints                  (2-3 hours)
          - Add getTwoFactorStatus, enableTwoFactor, verifyTotp,
            disableTwoFactor, generateBackupCodes, getTotpUri
          - Update me query and wallet token JWT

Step 3:  AuthContext + types + client    (1 hour)
          - Update AuthUser type
          - Add twoFactorClient to auth-client.ts
          - Add twoFactorPending state

Step 4:  TwoFactorChallenge page         (2-3 hours)
          - InputOTP component integration
          - totp/backup code verification
          - "Trust device" checkbox

Step 5:  SecurityTabContent panel        (3-4 hours)
          - Three states: disabled/setup/enabled
          - QR code display
          - OTP verification for enable
          - Disable with password

Step 6:  BackupCodesDialog               (1-2 hours)
          - Display, copy, download backup codes
          - Generate new codes flow

Step 7:  Email notifications (optional)  (1-2 hours)
          - 2FA enabled/disabled templates
          - Firebase-and-forget triggers

Step 8:  Testing                         (2-3 hours)
          - Unit tests for new components
          - Integration tests for tRPC endpoints
          - E2E tests for full flows

Step 9:  Polish & edge cases             (1-2 hours)
          - Loading/error states
          - Rate limiting UI feedback
          - Email verification gate

                               Total: ~14-21 hours
```

---

## 13. Key Files Changed Summary

| File | Change |
|---|---|
| `apps/server/src/utils/auth.ts` | MODIFY — add `twoFactor` plugin to `betterAuth()` plugins array |
| `apps/server/src/trpc/user.ts` | MODIFY — add 6 new 2FA procedures to `userRouter` |
| `apps/server/src/trpc/auth.ts` | MODIFY — include `twoFactorEnabled` in `me` query and wallet JWT |
| `apps/server/prisma/schema.prisma` | MODIFY — auto-migrated: `twoFactorEnabled` on User, new `TwoFactor` model |
| `apps/server/src/utils/email/email.ts` | MODIFY — add 2FA notification functions (optional) |
| `apps/client/src/lib/auth-client.ts` | MODIFY — add `twoFactorClient({ twoFactorPage: "/auth/two-factor" })` |
| `apps/client/src/contexts/AuthContext.tsx` | MODIFY — add `twoFactorPending` state |
| `apps/client/src/types/auth.ts` | MODIFY — add `twoFactorEnabled` to `AuthUser` type |
| `apps/client/src/App.tsx` | MODIFY — add `/auth/two-factor` route |
| `apps/client/src/components/panels/profile/ProfilePanel.tsx` | MODIFY — add "Security" tab |
| `apps/client/src/components/panels/profile/SecurityTabContent.tsx` | CREATE — main settings panel (3 states) |
| `apps/client/src/components/dialogs/BackupCodesDialog.tsx` | CREATE — backup codes modal |
| `apps/client/src/pages/auth/TwoFactorChallenge.tsx` | CREATE — login 2FA challenge page |
| `apps/client/src/pages/auth/index.ts` | MODIFY — export `TwoFactorChallenge` |
| `packages/constants/src/twoFactor.ts` | CREATE — shared 2FA constants |
| `packages/constants/src/index.ts` | MODIFY — export `twoFactor` |
| `apps/server/src/utils/email/TwoFactorEnabledTemplate.tsx` | CREATE — email template (optional) |
| `apps/server/src/utils/email/TwoFactorDisabledTemplate.tsx` | CREATE — email template (optional) |

---

## 14. better-auth 2FA Plugin API Reference

### Enable 2FA
```
POST /two-factor/enable
Body: { password: string, issuer?: string }
Returns: { totpURI: string, backupCodes: string[] }
```
Note: `twoFactorEnabled` stays `false` until TOTP is verified.

### Verify TOTP (during setup OR login challenge)
```
POST /two-factor/verify-totp
Body: { code: string, trustDevice?: boolean }
Returns: { token: string, user: {...} }
```

### Disable 2FA
```
POST /two-factor/disable
Body: { password: string }
Returns: { status: boolean }
```

### Generate Backup Codes
```
POST /two-factor/generate-backup-codes
Body: { password: string }
Returns: { status: boolean, backupCodes: string[] }
```
Old codes are invalidated.

### Verify Backup Code (login recovery)
```
POST /two-factor/verify-backup-code
Body: { code: string, trustDevice?: boolean }
Returns: { token: string, user: {...} }
```

### Get TOTP URI
```
POST /two-factor/get-totp-uri
Body: { password: string }
Returns: { totpURI: string }
```

### View Backup Codes (server-side, fresh session only)
```
POST /two-factor/view-backup-codes
Body: { userId: string }
Returns: { status: boolean, backupCodes: string[] }
```
