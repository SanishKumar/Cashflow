import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LedgerPage } from "../pages/LedgerPage";
import { auditLogApi, ledgerApi } from "../lib/api";

vi.mock("../lib/api", () => ({
  ledgerApi: { transactions: vi.fn() },
  auditLogApi: { list: vi.fn() },
}));

describe("LedgerPage navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ledgerApi.transactions).mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    vi.mocked(auditLogApi.list).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 });
  });

  it("opens the activity view from the tab query parameter", async () => {
    render(
      <MemoryRouter initialEntries={["/ledger?tab=activity"]}>
        <LedgerPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activity" })).toHaveClass("bg-surface-container-high");
    expect(ledgerApi.transactions).not.toHaveBeenCalled();
    expect(auditLogApi.list).toHaveBeenCalledOnce();
  });

  it("loads the transaction ledger with one paginated request", async () => {
    vi.mocked(ledgerApi.transactions).mockResolvedValue({
      items: [{
        id: "tx-1",
        groupId: "group-1",
        groupName: "Lisbon trip",
        groupCurrency: "EUR",
        amount: 24.5,
        description: "Dinner",
        createdAt: "2026-07-13T12:00:00.000Z",
        paidBy: { id: "user-1", name: "Alice" },
      }],
      total: 51,
      page: 1,
      limit: 50,
      totalPages: 2,
    });

    render(
      <MemoryRouter initialEntries={["/ledger"]}>
        <LedgerPage />
      </MemoryRouter>
    );

    expect(await screen.findAllByText("Dinner")).not.toHaveLength(0);
    expect(screen.getByText("51 records")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(ledgerApi.transactions).toHaveBeenCalledOnce();
    expect(auditLogApi.list).not.toHaveBeenCalled();
  });
});
