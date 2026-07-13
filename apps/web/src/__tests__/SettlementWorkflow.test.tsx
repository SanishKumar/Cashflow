import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettleUpModal } from "../components/SettleUpModal";
import { SettlementPaymentsPanel } from "../components/SettlementPaymentsPanel";
import { settlementPaymentApi } from "../lib/api";
import type { Group, Settlement, SettlementPayment } from "../types";

vi.mock("../lib/api", () => ({
  settlementPaymentApi: {
    create: vi.fn(),
    confirm: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
  },
}));

const group: Group = {
  id: "group-1",
  name: "Lisbon trip",
  description: null,
  currency: "USD",
  createdAt: "2026-07-13T00:00:00.000Z",
  members: [],
  _count: { transactions: 1 },
};

const suggestion: Settlement = {
  from: "user-1",
  fromName: "Alice",
  to: "user-2",
  toName: "Bob",
  amount: 25,
};

const pendingPayment: SettlementPayment = {
  id: "payment-1",
  groupId: "group-1",
  fromUserId: "user-1",
  toUserId: "user-2",
  fromUser: { id: "user-1", name: "Alice", email: "alice@example.com" },
  toUser: { id: "user-2", name: "Bob", email: "bob@example.com" },
  amount: 25,
  currency: "USD",
  status: "PENDING",
  note: null,
  decisionNote: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  decidedAt: null,
};

describe("settlement payment UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets only the suggested sender mark a payment as sent", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(settlementPaymentApi.create).mockResolvedValue(pendingPayment);
    render(
      <SettleUpModal
        group={group}
        settlements={[suggestion]}
        pendingPayments={[]}
        currentUserId="user-1"
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mark payment to Bob as sent" }));

    expect(settlementPaymentApi.create).toHaveBeenCalledWith("group-1", { toUserId: "user-2", amount: 25 });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Payment to Bob awaiting confirmation" })).toBeDisabled();
  });

  it("does not let another member mark the sender's payment", () => {
    render(
      <SettleUpModal
        group={group}
        settlements={[suggestion]}
        pendingPayments={[]}
        currentUserId="user-2"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Mark payment to Bob as sent" })).not.toBeInTheDocument();
    expect(screen.getByText("Only Alice can mark this payment as sent.")).toBeInTheDocument();
  });

  it("lets only the recipient confirm receipt from the payments view", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(settlementPaymentApi.confirm).mockResolvedValue({ ...pendingPayment, status: "CONFIRMED" });
    render(
      <SettlementPaymentsPanel
        groupId="group-1"
        payments={[pendingPayment]}
        currentUserId="user-2"
        pendingOnly={false}
        loading={false}
        onChanged={onChanged}
      />
    );

    await user.click(screen.getByRole("button", { name: "Confirm received" }));

    expect(settlementPaymentApi.confirm).toHaveBeenCalledWith("group-1", "payment-1");
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
