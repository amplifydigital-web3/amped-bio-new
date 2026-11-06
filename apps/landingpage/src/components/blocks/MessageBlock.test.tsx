import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  can: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    messages: {
      canMessage: {
        queryOptions: (input: { handle: string }) => ({
          queryKey: ["messages.canMessage", input],
          queryFn: () => mocks.can(input),
        }),
      },
    },
  },
  trpcClient: { messages: { send: { mutate: mocks.send } } },
}));
vi.mock("@/components/follow/FollowContext", () => ({ useFollowContext: () => null }));

import { MessageBlock } from "./MessageBlock";

const person = { id: 1, name: "Maya Lin", handle: "maya" };
function renderBlock(props: Partial<Parameters<typeof MessageBlock>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MessageBlock
        block={{ config: { label: "Message me" } }}
        theme={undefined}
        door={{ open: true, ruleKind: "FOLLOWER" }}
        handle="maya"
        creatorName="Maya Lin"
        creatorAvatar={null}
        signedIn
        authPending={false}
        isOwner={false}
        {...props}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.can.mockReset();
  mocks.send.mockReset();
  sessionStorage.clear();
});

describe("MessageBlock (Amped Messages M6, spec 8.4)", () => {
  it("renders nothing while the door is closed", () => {
    const { container } = renderBlock({ door: { open: false, ruleKind: "NOBODY" } });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the rule line under the button, never an amount", () => {
    renderBlock({ door: { open: true, ruleKind: "STAKE_MIN" } });
    expect(screen.getByText("Fans with a minimum stake")).toBeInTheDocument();
  });

  it("signed in: sends after canMessage allows, then points to the Inbox", async () => {
    mocks.can.mockResolvedValue({ allowed: true, folder: "PRIMARY", conversationId: null, person });
    mocks.send.mockResolvedValue({
      messageId: "m",
      conversationId: "c".repeat(32),
      folder: "PRIMARY",
    });
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: /Message me/ }));
    fireEvent.change(await screen.findByLabelText("Your message to Maya Lin"), {
      target: { value: "Hi Maya" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sent");
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "maya", body: "Hi Maya" })
    );
    expect(screen.getByRole("link", { name: "Open my Inbox" })).toHaveAttribute(
      "href",
      expect.stringContaining(`/inbox/${"c".repeat(32)}`)
    );
  });

  it("signed in: a refusal shows in the sheet before anything is written", async () => {
    mocks.can.mockResolvedValue({
      allowed: false,
      reason: "not_follower",
      message: "@maya takes messages from followers and members. Follow to message them.",
      person,
    });
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: /Message me/ }));
    await screen.findByText(/takes messages from followers and members/);
    expect(screen.queryByLabelText("Your message to Maya Lin")).not.toBeInTheDocument();
  });

  it("signed out: keeps the text and goes to the fan sign up card", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        set href(v: string) {
          assign(v);
        },
        get href() {
          return "http://localhost/maya";
        },
      },
      configurable: true,
    });
    renderBlock({ signedIn: false });
    fireEvent.click(screen.getByRole("button", { name: /Message me/ }));
    fireEvent.change(screen.getByLabelText("Your message to Maya Lin"), {
      target: { value: "Hello from a new fan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(JSON.parse(sessionStorage.getItem("amped_message_draft")!)).toEqual({
      handle: "maya",
      body: "Hello from a new fan",
    });
    expect(assign).toHaveBeenCalledWith("/register?intent=message&creator=maya");
    expect(mocks.can).not.toHaveBeenCalled();
  });
});
