/** Take It Down and copyright forms (adult content review 7.2 and 7.5, PR R3). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TAKEDOWN_COPY } from "@repo/constants";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), status: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      "link=https%3A%2F%2Famped.bio%2Fmaya%2Fc%2Fitem000000000001&k=keykeykeykeykeykeykeykey"
    ),
}));
vi.mock("@/lib/trpc", () => ({
  trpcClient: {
    takedown: { submit: { mutate: mocks.submit }, status: { query: mocks.status } },
    copyright: {
      submit: { mutate: vi.fn() },
      status: { query: mocks.status },
      counter: { mutate: vi.fn() },
    },
  },
}));

import { NoticeStatus, TakedownForm } from "./NoticeForms";

beforeEach(() => {
  mocks.submit.mockReset();
  mocks.status.mockReset();
});

describe("Take It Down form", () => {
  it("prefills the reported link and shows the number and what is missing", async () => {
    mocks.submit.mockResolvedValue({ number: "TD-2026-000001", missing: ["signature"] });
    render(<TakedownForm />);
    expect(screen.getByDisplayValue(/item000000000001/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(TAKEDOWN_COPY.statement));
    fireEvent.change(screen.getByLabelText(TAKEDOWN_COPY.email), {
      target: { value: "me@example.test" },
    });
    fireEvent.change(screen.getByLabelText(TAKEDOWN_COPY.signature), {
      target: { value: "Jane Doe" },
    });
    fireEvent.submit(screen.getByRole("button", { name: TAKEDOWN_COPY.submit }).closest("form")!);
    expect(await screen.findByText(TAKEDOWN_COPY.sent("TD-2026-000001"))).toBeInTheDocument();
    expect(screen.getByText(TAKEDOWN_COPY.needsMore)).toBeInTheDocument();
    expect(mocks.submit.mock.calls[0]![0]).toMatchObject({
      links: ["https://amped.bio/maya/c/item000000000001"],
      goodFaith: true,
      relationship: "self",
    });
  });

  it("asks for the relationship when acting for someone", () => {
    render(<TakedownForm />);
    fireEvent.click(screen.getByLabelText(TAKEDOWN_COPY.agent));
    expect(screen.getByLabelText(TAKEDOWN_COPY.agentDetail)).toBeRequired();
  });
});

describe("status page", () => {
  it("shows the state with the key from the link", async () => {
    mocks.status.mockResolvedValue({
      number: "TD-2026-000001",
      kind: "ncii",
      receivedAt: "2026-11-05T00:00:00Z",
      state: "hidden",
      outcome: null,
      missing: [],
      restoreFrom: null,
      restoreBy: null,
    });
    render(<NoticeStatus kind="takedown" number="TD-2026-000001" />);
    expect(await screen.findByText(TAKEDOWN_COPY.states.hidden)).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.status).toHaveBeenCalledWith({
        number: "TD-2026-000001",
        key: "keykeykeykeykeykeykeykey",
      })
    );
  });
});
