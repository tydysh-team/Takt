// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "./ToastProvider";
import { useToast } from "./toast-context";

function Controls() {
  const { notify } = useToast();
  return <>
    <button onClick={() => { notify("Сохранено"); }}>Успех</button>
    <button onClick={() => { notify("Информация", { tone: "info" }); }}>Информация</button>
    <button onClick={() => { notify("Предупреждение", { tone: "warning" }); }}>Предупреждение</button>
    <button onClick={() => { notify("Ошибка", { tone: "error" }); }}>Ошибка</button>
    {[1, 2, 3, 4].map((number) => <button key={number} onClick={() => { notify(`Сообщение ${String(number)}`); }}>Добавить {number}</button>)}
  </>;
}

function setup() {
  const result = render(<StrictMode><ToastProvider><Controls /></ToastProvider></StrictMode>);
  return { ...result, region: screen.getByRole("region", { name: "Уведомления" }) };
}

function advance(milliseconds: number) {
  act(() => { vi.advanceTimersByTime(milliseconds); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("toast notifications", () => {
  it.each([
    ["Успех", "Сохранено", 5000], ["Информация", "Информация", 5000],
    ["Предупреждение", "Предупреждение", 10000], ["Ошибка", "Ошибка", 10000],
  ] as const)("uses the configured lifetime for %s and animates removal", (button, text, lifetime) => {
    const { region } = setup();
    fireEvent.click(screen.getByRole("button", { name: button, exact: true }));
    expect(within(region).getByText(text)).toBeTruthy();
    expect(within(region).getByRole(button === "Ошибка" ? "alert" : "status").getAttribute("aria-atomic")).toBe("true");
    advance(lifetime - 1);
    expect(region.querySelector(".toast--closing")).toBeNull();
    advance(1);
    expect(region.querySelector(".toast--closing")).toBeTruthy();
    advance(180);
    expect(within(region).queryByText(text)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("closes with the cross before the timeout", () => {
    const { region } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Успех" }));
    fireEvent.click(within(region).getByRole("button", { name: "Закрыть уведомление" }));
    advance(180);
    expect(within(region).queryByText("Сохранено")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pauses for hover and focus together and resumes the remaining duration", () => {
    const { region } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Успех" }));
    advance(2000);
    const toast = within(region).getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => { within(toast).getByRole("button").focus(); });
    advance(20000);
    expect(region.querySelector(".toast--closing")).toBeNull();
    fireEvent.mouseLeave(toast);
    advance(20000);
    expect(region.querySelector(".toast--closing")).toBeNull();
    act(() => { screen.getByRole("button", { name: "Успех" }).focus(); });
    advance(2999);
    expect(region.querySelector(".toast--closing")).toBeNull();
    advance(1);
    expect(region.querySelector(".toast--closing")).toBeTruthy();
    advance(180);
    expect(within(region).queryByText("Сохранено")).toBeNull();
  });

  it("shows at most three notifications", () => {
    const { region } = setup();
    for (const number of [1, 2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `Добавить ${String(number)}` }));
    expect(within(region).getAllByRole("status")).toHaveLength(3);
    expect(within(region).queryByText("Сообщение 1")).toBeNull();
    expect(within(region).getByText("Сообщение 4")).toBeTruthy();
  });

  it("deduplicates repeated messages and refreshes their lifetime", () => {
    const { region } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Успех" }));
    advance(4000);
    fireEvent.click(screen.getByRole("button", { name: "Успех" }));
    expect(within(region).getAllByRole("status")).toHaveLength(1);
    advance(4999);
    expect(region.querySelector(".toast--closing")).toBeNull();
    advance(1);
    expect(region.querySelector(".toast--closing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Успех" }));
    advance(180);
    expect(within(region).getAllByRole("status")).toHaveLength(1);
    expect(region.querySelector(".toast--closing")).toBeNull();
  });

  it.each([false, true])("clears all timers on unmount, including exit=%s", (closing) => {
    const { unmount, region } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Успех" }));
    if (closing) fireEvent.click(within(region).getByRole("button", { name: "Закрыть уведомление" }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
