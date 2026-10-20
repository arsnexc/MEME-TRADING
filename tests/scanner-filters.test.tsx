import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScannerFilters } from "@/components/discovery/scanner-filters";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderFilters(overrides: Partial<React.ComponentProps<typeof ScannerFilters>> = {}) {
  const props: React.ComponentProps<typeof ScannerFilters> = {
    query: "",
    onQueryChange: () => undefined,
    timeframe: "h24",
    onTimeframeChange: () => undefined,
    network: "all",
    onNetworkChange: () => undefined,
    minLiquidity: 0,
    onMinLiquidityChange: () => undefined,
    showFilters: false,
    onToggleFilters: () => undefined,
    ...overrides,
  };
  render(
    <TooltipProvider delayDuration={0}>
      <ScannerFilters {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("screener filters", () => {
  it("offers the networks the build can actually trade", () => {
    renderFilters();
    expect(screen.getByRole("button", { name: "Solana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ethereum" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Base" })).toBeInTheDocument();

    // BNB is listed so the row matches the reference, but it cannot be picked:
    // there is no BNB paper account behind a Buy button.
    const bnb = screen.getByRole("button", { name: "BNB" });
    expect(bnb).toBeDisabled();
    expect(bnb.getAttribute("title")).toMatch(/only exist for SOL and ETH/);
  });

  it("disables the 7d window the pool APIs do not publish", () => {
    renderFilters();
    const week = screen.getByRole("button", { name: "7d" });
    expect(week).toBeDisabled();
    expect(week.getAttribute("title")).toMatch(/5m–24h/);
    // The windows that do exist stay live.
    expect(screen.getByRole("button", { name: "24h" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "1h" })).toBeEnabled();
  });

  it("lists categories as unavailable instead of guessing them from names", () => {
    renderFilters();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Category filter" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Category filter" }));

    expect(screen.getByRole("menuitemradio", { name: /all memes/i })).toHaveAttribute("aria-checked", "true");
    for (const label of ["Dogs", "Cats", "AI", "Political"]) {
      expect(screen.getByRole("menuitemradio", { name: label })).toBeDisabled();
    }
    expect(screen.getByText(/sector tags are not published/i)).toBeInTheDocument();
  });

  it("forwards the search box and the advanced drawer toggle", () => {
    const props = renderFilters();
    const onQueryChange = vi.fn();
    const onToggle = vi.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <ScannerFilters {...props} onQueryChange={onQueryChange} onToggleFilters={onToggle} />
      </TooltipProvider>,
    );
    const boxes = screen.getAllByLabelText("Filter loaded tokens");
    fireEvent.change(boxes[boxes.length - 1], { target: { value: "bonk" } });
    expect(onQueryChange).toHaveBeenCalledWith("bonk");

    const filters = screen.getAllByRole("button", { name: /filters/i });
    fireEvent.click(filters[filters.length - 1]);
    expect(onToggle).toHaveBeenCalled();
  });
});
