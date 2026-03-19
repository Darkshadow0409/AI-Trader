import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePollingResource } from "./hooks";

describe("usePollingResource", () => {
  it("does not start overlapping refresh loads when polling is slower than the interval", async () => {
    vi.useFakeTimers();
    let resolveLoad: ((value: string) => void) | null = null;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    renderHook(() => usePollingResource(loader, "seed", { intervalMs: 1000 }));

    expect(loader).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    expect(loader).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLoad?.("loaded");
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(loader).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("waits to load disabled resources until they are enabled", async () => {
    const loader = vi.fn().mockResolvedValue("ready");

    const { rerender } = renderHook(
      ({ enabled }) => usePollingResource(loader, "seed", { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(loader).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("preserves the last known good data when a resource is disabled", async () => {
    const loader = vi.fn().mockResolvedValue("live");

    const { result, rerender } = renderHook(
      ({ enabled }) => usePollingResource(loader, "seed", { enabled, preserveData: true }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBe("live");

    rerender({ enabled: false });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBe("live");
    expect(result.current.loading).toBe(false);
  });
});
