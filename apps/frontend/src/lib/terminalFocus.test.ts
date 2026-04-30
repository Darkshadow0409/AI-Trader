import { describe, expect, it } from "vitest";
import { isPrimaryCommodity, sameTerminalFocusSymbol, terminalFocusPriority } from "./terminalFocus";

describe("terminalFocus", () => {
  it("treats trader-facing commodity aliases as the same focus asset", () => {
    expect(sameTerminalFocusSymbol("WTI", "USOUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("WTI_CTX", "USOUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("CL=F", "USOUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("GOLD", "XAUUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("GC=F", "XAUUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("SILVER", "XAGUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("XAG_CTX", "XAGUSD")).toBe(true);
    expect(sameTerminalFocusSymbol("SI=F", "XAGUSD")).toBe(true);
  });

  it("keeps trader-facing commodity aliases in the primary board", () => {
    expect(isPrimaryCommodity("USOUSD")).toBe(true);
    expect(isPrimaryCommodity("XAUUSD")).toBe(true);
    expect(isPrimaryCommodity("XAGUSD")).toBe(true);
    expect(terminalFocusPriority("USOUSD")).toBe(terminalFocusPriority("WTI"));
  });
});
