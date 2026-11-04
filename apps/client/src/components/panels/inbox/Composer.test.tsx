import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MESSAGE_LIMITS } from "@repo/constants";

vi.mock("@repo/ui", async importOriginal => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return {
    ...actual,
    trpcClient: { realtime: { typing: { mutate: vi.fn(async () => ({ sent: true })) } } },
  };
});

import { Composer } from "./ConversationView";

describe("Composer (spec 8.2 item 5)", () => {
  it("sends on Enter, keeps Shift Enter as a line break, and refuses empty text", () => {
    const onSend = vi.fn();
    render(<Composer conversationId={"ab".repeat(16)} handle="maya" onSend={onSend} />);
    const box = screen.getByLabelText("Message @maya");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "  hello  " } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(box).toHaveValue("");
  });

  it("shows the count from 1,800 and blocks sending past 2,000", () => {
    const onSend = vi.fn();
    render(<Composer conversationId={null} handle="maya" onSend={onSend} />);
    const box = screen.getByLabelText("Message @maya");
    fireEvent.change(box, { target: { value: "x".repeat(MESSAGE_LIMITS.bodyCountFrom) } });
    expect(screen.getByText("200 left")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "x".repeat(MESSAGE_LIMITS.bodyMax + 1) } });
    expect(screen.getByText("-1 left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
