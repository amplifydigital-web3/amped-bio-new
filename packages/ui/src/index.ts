// UI components
export { Button, buttonVariants, type ButtonProps } from "./button";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./card";
export { Input } from "./input";
export { Label } from "./label";
export { Skeleton } from "./skeleton";
export { Toaster } from "./sonner";
export { Switch } from "./Switch";
export { Badge, badgeVariants } from "./badge";
export * from "./dialog";
export * from "./form";
export * from "./select";
export * from "./Tooltip";
export { Textarea } from "./Textarea";

// Prism 2.2 components (docs/PRISM.md)
export { Chip, ChipGroup, type ChipProps, type ChipGroupOption } from "./prism/chip";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./prism/tabs";
export {
  MOTION,
  PRISM_EASE,
  drawStroke,
  listTransition,
  markTransitionCommitted,
  motionAllowed,
  prefersReducedMotion,
  pulseOnce,
  roomTransition,
  transitionName,
  useIsomorphicLayoutEffect,
  useOffscreenPause,
  viewTransition,
  type PrismTransitionKind,
} from "./prism/motion";
export { SuccessMoment, DrawnCheck } from "./prism/moments/success-moment";
export {
  Menu,
  MenuTrigger,
  MenuGroup,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
} from "./prism/menu";
export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
} from "./prism/bottom-sheet";
export {
  EmptyState,
  ErrorCard,
  Notice,
  ToastCard,
  TESTNET_NOTICE,
  type PrismToastType,
} from "./prism/states";
export {
  RnsIdentityChip,
  RnsVerifiedMark,
  RNS_IDENTITY_COPY,
  formatRnsDate,
  type RnsIdentity,
  type RnsIdentityCheck,
  type RnsIdentityChipProps,
} from "./prism/rns-identity";
export {
  SidePanel,
  StepBar,
  AmountWell,
  AmountPresets,
  ReviewSlab,
  Checkbox,
  CommitAction,
  WALLET_NOTE,
  type SidePanelProps,
  type AmountWellProps,
} from "./prism/flow";
export {
  AuthCard,
  AuthCardSkeleton,
  AuthLegalLine,
  AuthSwitchLine,
  CAPTCHA_FAILED,
  GOOGLE_FAILED_BODY,
  GOOGLE_FAILED_TITLE,
  GoogleSignInButton,
  InlineError,
  OrDivider,
  PasswordInput,
  startGoogleSignIn,
  classifyAuthError,
  SUPPORT_TICKET_URL,
  StatusDisc,
  useCooldown,
  RESEND_COOLDOWN_SECONDS,
  type AuthErrorKind,
  type GoogleSignInOptions,
} from "./prism/auth";
export {
  PoolCardFeatured,
  PoolCardMedium,
  PoolRow,
  type PoolCardData,
  type PoolStat,
} from "./prism/pool-card";
export { cn } from "./utils";
// Creator blocks shared by the public page and the editor preview (Build Board #30)
export {
  FollowersCard,
  type FollowersCardData,
  type FollowersCardFace,
  type FollowersCardProps,
} from "./creator/followers-card";
export { ExternalRedirect } from "./external-redirect";

// Auth
export { AuthProvider, useAuth } from "./auth-context";
export type { AuthContextType } from "./auth-context";
export { authClient } from "./auth-client";
export type { Session } from "./auth-client";
export type { AuthUser } from "./auth-types";
export type { EnrichedSessionUser } from "./session-types";

// TRPC client
export { queryClient, trpcClient, trpc } from "./trpc";
export type { RouterOutputs } from "./trpc";
export * from "./trpc-types";

// OAuth 2.1 provider hosted pages ("Sign in with Amped.bio")
export { OAuthShell } from "./oauth/oauth-shell";
export { OAuthLoginScreen, useOAuthClientName } from "./oauth/oauth-login-screen";
export { OAuthConsentScreen } from "./oauth/oauth-consent-screen";
export { OAuthDeviceScreen } from "./oauth/oauth-device-screen";
export { describeOAuthScope, OAUTH_SCOPE_DESCRIPTIONS } from "./oauth/oauth-scopes";
export {
  navigateToProviderRedirect,
  useOAuthFlowQuery,
  type OAuthFlowQuery,
} from "./oauth/use-oauth-flow-query";

// Utilities
export * from "./handle";
export * from "./schemas";
export * from "./admin-format";
export * from "./blockchain";
export * from "./email";
export * from "./theme";
export * from "./theme-style";
export { usePrefersReducedMotion } from "./use-reduced-motion";
export * from "./video-thumbnail";

// Auth storage keys
export * from "./auth-storage";
