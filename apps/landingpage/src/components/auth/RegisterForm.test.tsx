import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GOOGLE_FAILED_BODY, GOOGLE_FAILED_TITLE, startGoogleSignIn } from "@/test/mocks/ui";
import { RegisterForm } from "./RegisterForm";
import { EMAIL_FIX } from "./SignInForm";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterForm />
    </QueryClientProvider>
  );
}

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  signUpEmail: vi.fn(),
  executeCaptcha: vi.fn(() => Promise.resolve<string | null>("token")),
  isCaptchaEnabled: false,
  referrerId: null,
  urlStatus: "Available" as
    | "Unknown"
    | "TooShort"
    | "Invalid"
    | "Checking"
    | "Available"
    | "Unavailable"
    | "Error",
  goTo: vi.fn(),
  getPostAuthDestination: vi.fn(() => "/"),
  getReferrerInfoOptions: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: mocks.signUpEmail } },
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
  useReferralHandler: () => ({
    getReferrerId: () => mocks.referrerId,
    clearReferrerId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useHandleAvailability", () => ({
  useHandleAvailability: () => ({ urlStatus: mocks.urlStatus, recheck: vi.fn(), isValid: true }),
}));
vi.mock("@/lib/trpc", () => ({
  trpcClient: { handle: { checkAvailability: { query: vi.fn() } } },
  trpc: { referral: { getReferrerInfo: { queryOptions: mocks.getReferrerInfoOptions } } },
}));
vi.mock("@/lib/panel", () => ({
  getPostAuthDestination: mocks.getPostAuthDestination,
  goTo: mocks.goTo,
  toAbsoluteUrl: (url: string) => url,
}));
vi.mock("@/utils/ga", () => ({ trackGAEvent: () => {} }));

const EMAIL_TAKEN = "This email already has an account.";

function fillHandle(handle: string) {
  fireEvent.change(screen.getByTestId("register-handle"), { target: { value: handle } });
}
function fillEmail(email: string) {
  fireEvent.change(screen.getByTestId("register-email"), { target: { value: email } });
}
function fillPassword(password: string) {
  fireEvent.change(screen.getByTestId("register-password"), { target: { value: password } });
}
function submit() {
  fireEvent.submit(screen.getByTestId("register-form"));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = new URLSearchParams();
    mocks.isCaptchaEnabled = false;
    mocks.urlStatus = "Available";
    mocks.referrerId = null;
    mocks.executeCaptcha.mockResolvedValue("token");
    mocks.signUpEmail.mockResolvedValue({ data: {} });
    mocks.getPostAuthDestination.mockReturnValue("/");
  });

  it("renders the register card with handle, email and password fields", () => {
    renderForm();
    expect(screen.getByTestId("auth-card")).toHaveTextContent("Claim your page");
    expect(screen.getByLabelText("Your page URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByTestId("switch-to-login")).toBeInTheDocument();
  });

  it("blocks an empty submit with field errors and does not call sign up", () => {
    renderForm();
    submit();
    expect(screen.getByText("Choose your page URL.")).toBeInTheDocument();
    expect(screen.getByText(EMAIL_FIX)).toBeInTheDocument();
    expect(screen.getByText("Meet every password rule below.")).toBeInTheDocument();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a taken handle before submitting", () => {
    mocks.urlStatus = "Unavailable";
    renderForm();
    fillHandle("taken");
    fillEmail("ada@example.com");
    fillPassword("Password1!");
    submit();
    expect(screen.getByText("amped.bio/taken is taken. Pick another.")).toBeInTheDocument();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("registers a valid user and navigates to the welcome destination", async () => {
    renderForm();
    fillHandle("ada");
    fillEmail("ada@example.com");
    fillPassword("S3cure-pass!");
    submit();

    await waitFor(() =>
      expect(mocks.signUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "ada@example.com",
          password: "S3cure-pass!",
          name: "ada",
          handle: "ada",
          callbackURL: expect.any(String),
        })
      )
    );
    await waitFor(() => expect(mocks.goTo).toHaveBeenCalledWith("/"));
  });

  it("reports an email that already has an account", async () => {
    mocks.signUpEmail.mockResolvedValue({
      error: { status: 422, code: "USER_ALREADY_EXISTS", message: "already exists" },
    });
    renderForm();
    fillHandle("ada");
    fillEmail("taken@example.com");
    fillPassword("S3cure-pass!");
    submit();

    await waitFor(() => expect(screen.getByText(EMAIL_TAKEN)).toBeInTheDocument());
    expect(
      screen
        .getAllByRole("link", { name: "Sign in" })
        .some(
          link =>
            link.getAttribute("href") === `/login?email=${encodeURIComponent("taken@example.com")}`
        )
    ).toBe(true);
  });

  it("points a server-side handle error back at the handle field", async () => {
    mocks.signUpEmail.mockResolvedValue({
      error: { status: 400, code: "INVALID_HANDLE", message: "handle already taken" },
    });
    renderForm();
    fillHandle("ada");
    fillEmail("ada@example.com");
    fillPassword("S3cure-pass!");
    submit();

    await waitFor(() =>
      expect(screen.getByText("amped.bio/ada is taken. Pick another.")).toBeInTheDocument()
    );
  });

  it("shows the captcha error when the browser check did not finish", async () => {
    mocks.isCaptchaEnabled = true;
    mocks.executeCaptcha.mockResolvedValue(null);
    renderForm();
    fillHandle("ada");
    fillEmail("ada@example.com");
    fillPassword("S3cure-pass!");
    submit();

    await waitFor(() =>
      expect(
        screen.getByText("The browser check did not finish. Check your connection.")
      ).toBeInTheDocument()
    );
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("shows the network error notice when sign up throws", async () => {
    mocks.signUpEmail.mockRejectedValue(new TypeError("fetch failed"));
    renderForm();
    fillHandle("ada");
    fillEmail("ada@example.com");
    fillPassword("S3cure-pass!");
    submit();

    await waitFor(() =>
      expect(screen.getByText("Your account was not created")).toBeInTheDocument()
    );
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
  });

  it("starts Google sign in and shares the confirmed handle", async () => {
    renderForm();
    fillHandle("ada");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(startGoogleSignIn).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "/",
          newUserCallbackURL: "/",
          errorCallbackURL: "/register?error=google",
          handle: "ada",
        })
      )
    );
  });

  it("shows the Google failure notice", async () => {
    startGoogleSignIn.mockResolvedValueOnce("failed");
    renderForm();
    fillHandle("ada");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(screen.getByText(GOOGLE_FAILED_TITLE)).toBeInTheDocument());
    expect(screen.getByText(GOOGLE_FAILED_BODY)).toBeInTheDocument();
  });
});
