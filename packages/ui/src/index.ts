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
export { cn } from "./utils";
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
export { OAuthLoginScreen } from "./oauth/oauth-login-screen";
export { OAuthConsentScreen } from "./oauth/oauth-consent-screen";
export { OAuthDeviceScreen } from "./oauth/oauth-device-screen";
export { describeOAuthScope, OAUTH_SCOPE_DESCRIPTIONS } from "./oauth/oauth-scopes";
export { navigateToProviderRedirect, useOAuthFlowQuery, type OAuthFlowQuery } from "./oauth/use-oauth-flow-query";

// Utilities
export * from "./handle";
export * from "./schemas";
export * from "./admin-format";
export * from "./blockchain";
export * from "./email";
export * from "./theme";
export * from "./video-thumbnail";

// Auth storage keys
export * from "./auth-storage";
