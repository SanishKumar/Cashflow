import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetHandle } from "../components/SheetHandle";
import { useStoredFlag } from "../hooks/useStoredFlag";

describe("SheetHandle", () => {
  it("opens a folded sheet on a tap", () => {
    const onChange = vi.fn();
    render(<SheetHandle open={false} onChange={onChange} label="details" />);

    const handle = screen.getByRole("button", { name: "Show details" });
    expect(handle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(handle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("folds an open sheet on a tap", () => {
    const onChange = vi.fn();
    render(<SheetHandle open onChange={onChange} label="balances" />);

    fireEvent.click(screen.getByRole("button", { name: "Hide balances" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("follows a drag, and is not undone by the click that ends it", () => {
    const onChange = vi.fn();
    render(<SheetHandle open onChange={onChange} label="details" />);
    const handle = screen.getByRole("button", { name: "Hide details" });

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 170, pointerId: 1 });
    fireEvent.click(handle);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("opens on a drag upwards", () => {
    const onChange = vi.fn();
    render(<SheetHandle open={false} onChange={onChange} label="details" />);
    const handle = screen.getByRole("button", { name: "Show details" });

    fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 220, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("treats a few pixels of wobble as a tap, not a drag", () => {
    const onChange = vi.fn();
    render(<SheetHandle open={false} onChange={onChange} label="details" />);
    const handle = screen.getByRole("button", { name: "Show details" });

    fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 306, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(handle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("useStoredFlag", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no opinion until someone chooses", () => {
    const { result } = renderHook(() => useStoredFlag("test.panel"));
    expect(result.current[0]).toBeUndefined();
  });

  it("remembers the choice the next time the screen is opened", () => {
    const first = renderHook(() => useStoredFlag("test.panel"));
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    first.unmount();

    const second = renderHook(() => useStoredFlag("test.panel"));
    expect(second.result.current[0]).toBe(false);
  });

  it("keeps panels apart by key", () => {
    const sheet = renderHook(() => useStoredFlag("test.sheet"));
    act(() => sheet.result.current[1](true));

    const column = renderHook(() => useStoredFlag("test.column"));
    expect(column.result.current[0]).toBeUndefined();
  });

  it("still holds the choice when storage refuses the write", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useStoredFlag("test.panel"));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
