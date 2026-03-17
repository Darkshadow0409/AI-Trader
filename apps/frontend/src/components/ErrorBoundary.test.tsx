import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Thrower() {
  throw new Error("chart blew up");
  return null;
}

describe("ErrorBoundary", () => {
  it("contains panel failures instead of blanking the app shell", () => {
    render(
      <ErrorBoundary label="Chart Surface">
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Chart Surface failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry Panel/i })).toBeInTheDocument();
  });
});
