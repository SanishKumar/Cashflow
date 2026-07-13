import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../contexts/ThemeContext";
import { DemoPage } from "../pages/DemoPage";

function renderDemo() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <DemoPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe("DemoPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clearly identifies the isolated, unsaved workspace", () => {
    renderDemo();

    expect(screen.getByText("Demo workspace — nothing is saved")).toBeInTheDocument();
    expect(screen.getByText(/cannot read or change a CashFlow account/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Shared spending: $673.00")).toBeInTheDocument();
  });

  it("recalculates the local plan without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderDemo();

    await user.type(screen.getByPlaceholderText("e.g. Ferry tickets"), "Ferry tickets");
    await user.type(screen.getByLabelText("Amount in USD"), "40");
    await user.click(screen.getByRole("button", { name: "Add to this demo" }));

    expect(screen.getByText("Ferry tickets")).toBeInTheDocument();
    expect(screen.getByLabelText("Shared spending: $713.00")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
