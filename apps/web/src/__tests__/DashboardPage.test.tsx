import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import { dashboardApi, groupApi } from "../lib/api";
import { BrowserRouter } from "react-router-dom";
import type { DashboardStats } from "../types";

vi.mock("../lib/api", () => ({
  dashboardApi: {
    getStats: vi.fn(),
  },
  groupApi: {
    list: vi.fn(),
  },
}));

const mockStats: DashboardStats = {
  totalGroups: 5,
  totalTransactions: 42,
  netPosition: 1250.5,
  pendingSettlements: 3,
  pendingGroups: [
    { groupId: "group-1", groupName: "Trip", pendingCount: 3 },
  ],
  monthlyVolume: [
    { month: "2026-01", volume: 100 },
    { month: "2026-02", volume: 200 },
    { month: "2026-03", volume: 50 },
    { month: "2026-04", volume: 300 },
    { month: "2026-05", volume: 150 },
    { month: "2026-06", volume: 400 },
  ],
  totalVolume: 1200,
  recentActivity: [
    {
      id: "log-1",
      userId: "user-1",
      groupId: "group-1",
      action: "EXPENSE_ADDED",
      details: "Added dinner expense",
      createdAt: new Date().toISOString(),
      user: { id: "user-1", name: "Alice", email: "alice@test.com", avatarUrl: null },
      group: { id: "group-1", name: "Trip" },
    },
  ],
};

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(groupApi.list).mockResolvedValue([]);
  });

  it("shows loading state initially", () => {
    // Return an unresolved promise to keep it in loading state
    vi.mocked(dashboardApi.getStats).mockImplementation(() => new Promise(() => {}));
    
    const { container } = renderWithRouter(<DashboardPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    vi.mocked(dashboardApi.getStats).mockRejectedValue(new Error("Failed to load"));
    
    renderWithRouter(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText("Your overview is unavailable")).toBeInTheDocument();
      // The useApi hook might display error.message or standard error string
    });
  });

  it("renders KPIs correctly", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);
    
    renderWithRouter(<DashboardPage />);
    
    await waitFor(() => {
      // KPI values
      expect(screen.getByText("5")).toBeInTheDocument(); // Groups
      expect(screen.getByText("42")).toBeInTheDocument(); // Transactions
      expect(screen.getByText("+$1,251")).toBeInTheDocument(); // Net Position
      expect(screen.getByText("3")).toBeInTheDocument(); // Pending Settlements
    });
  });

  it("renders activity feed", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);
    
    renderWithRouter(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText("Recent activity")).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Added dinner expense")).toBeInTheDocument();
      expect(screen.getAllByText("Trip").length).toBeGreaterThan(0);
      expect(screen.getByRole("link", { name: "All activity" })).toHaveAttribute("href", "/ledger?tab=activity");
    });
  });

  it("links pending settlement payments to the affected group", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);

    renderWithRouter(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /3 pending payments/i })).toHaveAttribute(
        "href",
        "/groups/group-1?status=pending"
      );
    });
  });

  it("renders empty activity feed state", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue({
      ...mockStats,
      recentActivity: [],
    });
    
    renderWithRouter(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText("No recent activity")).toBeInTheDocument();
    });
  });

  it("renders the volume chart", async () => {
    vi.mocked(dashboardApi.getStats).mockResolvedValue(mockStats);
    
    renderWithRouter(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText("Shared spending")).toBeInTheDocument();
      expect(screen.getByText("$1,200")).toBeInTheDocument(); // Total volume
    });
  });
});
