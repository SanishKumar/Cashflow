import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { DashboardPage } from "../pages/DashboardPage";
import { dashboardApi } from "../lib/api";
import type { DashboardStats } from "../types";

vi.mock("../lib/api", () => ({ dashboardApi: { getStats: vi.fn() } }));
vi.mock("../contexts/UserContext", () => ({
  useUser: () => ({ currentUser: { id: "user-1", name: "Alice Smith", email: "alice@example.com", avatarUrl: null } }),
}));

const mockStats: DashboardStats = {
  totalGroups: 2,
  totalTransactions: 12,
  pendingSettlements: 1,
  pendingGroups: [{ groupId: "group-1", groupName: "Trip", pendingCount: 1 }],
  groups: [{
    id: "group-1",
    name: "Trip",
    description: "Lisbon weekend",
    currency: "EUR",
    memberCount: 4,
    expenseCount: 8,
  }],
  outgoingSettlements: [{
    groupId: "group-1",
    groupName: "Trip",
    currency: "EUR",
    fromUserId: "user-1",
    fromName: "Alice",
    toUserId: "user-2",
    toName: "Bob",
    amount: 42.5,
    state: "OPEN",
  }],
  incomingSettlements: [{
    groupId: "group-2",
    groupName: "Home",
    currency: "USD",
    fromUserId: "user-3",
    fromName: "Chris",
    toUserId: "user-1",
    toName: "Alice",
    amount: 18,
    state: "OPEN",
  }],
  pendingConfirmations: [{
    id: "payment-1",
    groupId: "group-1",
    groupName: "Trip",
    fromUserId: "user-4",
    fromName: "Dana",
    amount: 20,
    currency: "EUR",
    createdAt: new Date().toISOString(),
  }],
  recentActivity: [{
    id: "log-1",
    userId: "user-1",
    groupId: "group-1",
    action: "EXPENSE_ADDED",
    details: "Added dinner expense",
    createdAt: new Date().toISOString(),
    user: { id: "user-1", name: "Alice", email: "alice@test.com", avatarUrl: null },
    group: { id: "group-1", name: "Trip" },
  }],
};

function renderDashboard() {
  return render(<BrowserRouter><DashboardPage /></BrowserRouter>);
}

describe("DashboardPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading skeleton", () => {
    vi.mocked(dashboardApi.getStats).mockImplementation(() => new Promise(() => {}));
    const { container } = renderDashboard();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows an API error", async () => {
    vi.mocked(dashboardApi.getStats).mockRejectedValue(new Error("Failed to load"));
    renderDashboard();
    expect(await screen.findByText("Your overview is unavailable")).toBeInTheDocument();
  });

  it("renders action-focused account metrics without combining currencies", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);
    renderDashboard();

    expect(await screen.findByText("Alice, here’s what needs attention.")).toBeInTheDocument();
    expect(screen.getByLabelText("Active groups: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Expenses: 12")).toBeInTheDocument();
    expect(screen.getByLabelText("To confirm: 1")).toBeInTheDocument();
    expect(screen.queryByText(/net position/i)).not.toBeInTheDocument();
  });

  it("links confirmations and outgoing payments to the correct group flow", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Confirm €20.00 from Dana in Trip" })).toHaveAttribute(
        "href",
        "/groups/group-1?status=pending"
      );
      expect(screen.getByRole("link", { name: "Pay €42.50 to Bob in Trip" })).toHaveAttribute(
        "href",
        "/groups/group-1?settle=1"
      );
    });
  });

  it("keeps activity one level deeper", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);
    renderDashboard();

    expect(await screen.findByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("Added dinner expense")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All activity" })).toHaveAttribute("href", "/ledger?tab=activity");
  });

  it("shows a settled state when no action is assigned", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue({
      ...mockStats,
      outgoingSettlements: [],
      incomingSettlements: [],
      pendingConfirmations: [],
      pendingSettlements: 0,
    });
    renderDashboard();

    expect(await screen.findByText("Nothing needs your attention")).toBeInTheDocument();
    expect(screen.getByText("No one owes you right now")).toBeInTheDocument();
  });
});
