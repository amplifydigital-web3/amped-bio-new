import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GOOGLE_FAILED_BODY, GOOGLE_FAILED_TITLE, startGoogleSignIn } from "@/test/mocks/ui";
import { SignInForm, EMAIL_FIX } from "./SignInForm";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  signInEmail: vi.fn(),
  executeCaptcha: vi.fn(() => Promise.resolve<string | null>("token")),
  isCaptchaEnabled: false,
  goTo: vi.fn(),
  getSafeRedirect: vi.fn(() => null),
  getPostAuthDestination: vi.fn(() => "/"),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: mocks.signInEmail } },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : JSON.stringify(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@repo/ui", () => import("@/test/mocks/ui"));
vi.mock("@/hooks/useCaptcha", () => ({
  useCaptcha: () => ({
    executeCaptcha: () => mocks.executeCaptcha(),
    isCaptchaEnabled: mocks.isCaptchaEnabled,
  }),
}));
vi.mock("@/hooks/useReferralHandler", () => ({
  useReferralHandler: () => ({ getReferrerId: () => null }),
}));
vi.mock("@/lib/panel", () => ({
  getSafeRedirect: mocks.getSafeRedirect,
  getPostAuthDestination: mocks.getPostAuthDestination,
  goTo: mocks.goTo,
  toAbsoluteUrl: (url: string) => url,
}));
vi.mock("@/utils/ga", () => ({ trackGAEvent: () => {} }));

const CREDENTIALS_ERROR = "Email or password is incorrect.";

function fillEmail(email: string) {
  fireEvent.change(screen.getByTestId("login-email"), { target: { value: email } });
}
function fillPassword(password: string) {
  fireEvent.change(screen.getByTestId("login-password"), { target: { value: password } });
}
function submit() {
  fireEvent.submit(screen.getByTestId("login-form"));
}

function renderForm() {
  return render(<SignInForm />);
}

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = new URLSearchParams();
    mocks.isCaptchaEnabled = false;
    mocks.executeCaptcha.mockResolvedValue("token");
    mocks.signInEmail.mockResolvedValue({ data: {} });
    mocks.getSafeRedirect.mockReturnValue(null);
    mocks.getPostAuthDestination.mockReturnValue("/");
  });

  it("renders the sign in card with email and password fields", () => {
    renderForm();
    expect(screen.getByTestId("auth-card")).toHaveTextContent("Sign in");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByTestId("switch-to-register")).toBeInTheDocument();
  });

  it("shows validation errors on an empty submit and does not call sign in", () => {
    renderForm();
    submit();
    expect(screen.getByText(EMAIL_FIX)).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid email format", () => {
    renderForm();
    fillEmail("not-an-email");
    fillPassword("secret123");
    submit();
    expect(screen.getByText(EMAIL_FIX)).toBeInTheDocument();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("signs in with valid credentials and navigates to the destination", async () => {
    renderForm();
    fillEmail("ada@example.com");
    fillPassword("secret123");
    submit();

    await waitFor(() =>
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "secret123",
        rememberMe: true,
        fetchOptions: { headers: { "x-captcha-response": "token" } },
      })
    );
    await waitFor(() => expect(mocks.goTo).toHaveBeenCalledWith("/"));
  });

  it("shows the credentials error and a reset link when the password is wrong", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        status: 401,
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      },
    });
    renderForm();
    fillEmail("ada@example.com");
    fillPassword("wrong-password");
    submit();

    await waitFor(() => expect(screen.getByText(CREDENTIALS_ERROR)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Reset password" })).toBeInTheDocument();
  });

  it("shows the blocked account notice", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: { status: 403, code: "ACCOUNT_BLOCKED", message: "account is blocked" },
    });
    renderForm();
    fillEmail("ada@example.com");
    fillPassword("secret123");
    submit();

    await waitFor(() => expect(screen.getByText("Account blocked")).toBeInTheDocument());
    expect(screen.getByText("Contact support to learn more.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "https://example.test/support/tickets/new"
    );
  });

  it("shows a network error notice when sign in throws", async () => {
    mocks.signInEmail.mockRejectedValue(new TypeError("fetch failed"));
    renderForm();
    fillEmail("ada@example.com");
    fillPassword("secret123");
    submit();

    await waitFor(() => expect(screen.getByText("You are not signed in")).toBeInTheDocument());
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
  });

  it("does not sign in when the captcha is enabled but no token came back", async () => {
    mocks.isCaptchaEnabled = true;
    mocks.executeCaptcha.mockResolvedValue(null);
    renderForm();
    fillEmail("ada@example.com");
    fillPassword("secret123");
    submit();

    await waitFor(() =>
      expect(
        screen.getByText("The browser check did not finish. Check your connection.")
      ).toBeInTheDocument()
    );
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("starts Google sign in with the post auth destination", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(startGoogleSignIn).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "/",
          newUserCallbackURL: "/",
          errorCallbackURL: "/login?error=google",
        })
      )
    );
  });

  it("shows the Google error notice when Google sign in fails", async () => {
    startGoogleSignIn.mockResolvedValueOnce("failed");
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(screen.getByText(GOOGLE_FAILED_TITLE)).toBeInTheDocument());
    expect(screen.getByText(GOOGLE_FAILED_BODY)).toBeInTheDocument();
  });
});
