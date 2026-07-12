import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LedgerPage } from "../pages/LedgerPage";
import { auditLogApi, groupApi } from "../lib/api";

vi.mock("../lib/api", () => ({
  groupApi: { list: vi.fn() },
  transactionApi: { list: vi.fn() },
  auditLogApi: { list: vi.fn() },
}));

describe("LedgerPage navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(groupApi.list).mockResolvedValue([]);
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
  });
});
