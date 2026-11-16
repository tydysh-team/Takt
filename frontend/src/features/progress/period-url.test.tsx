// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { periodFromSearch, periodSearch, useProgressPeriod } from "./period-url";

const selected = {
  date_from: "2026-03-31T20:00:00Z",
  date_to: "2026-04-30T20:00:00Z",
};
const next = {
  date_from: "2026-04-30T20:00:00Z",
  date_to: "2026-05-31T20:00:00Z",
};

function PeriodProbe() {
  const { period, setPeriod } = useProgressPeriod("Europe/Samara");
  const location = useLocation();
  return <>
    <output data-testid="period">{period.date_from}|{period.date_to}</output>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => { setPeriod(next); }}>Выбрать период</button>
  </>;
}

describe("progress period in URL", () => {
  it("round-trips timezone-aware half-open dates and rejects invalid ranges", () => {
    expect(periodFromSearch(new URLSearchParams(periodSearch(selected)))).toEqual(selected);
    expect(periodFromSearch(new URLSearchParams("date_from=2026-04-01T00%3A00%3A00&date_to=2026-05-01T00%3A00%3A00Z"))).toBeNull();
    expect(periodFromSearch(new URLSearchParams("date_from=2026-04-30T20%3A00%3A00Z&date_to=2026-03-31T20%3A00%3A00Z"))).toBeNull();
  });

  it("restores the chosen period after navigation and updates its URL", () => {
    render(<MemoryRouter initialEntries={[`/students/student-1?${periodSearch(selected)}`]}><PeriodProbe /></MemoryRouter>);
    expect(screen.getByTestId("period").textContent).toBe(`${selected.date_from}|${selected.date_to}`);
    expect(screen.getByTestId("location").textContent).toContain("date_from=2026-03-31T20%3A00%3A00Z");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать период" }));
    expect(screen.getByTestId("period").textContent).toBe(`${next.date_from}|${next.date_to}`);
    expect(screen.getByTestId("location").textContent).toContain("date_to=2026-05-31T20%3A00%3A00Z");
  });
});
