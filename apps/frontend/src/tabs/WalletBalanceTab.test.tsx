import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalletBalanceTab } from "./WalletBalanceTab";
import {
  mockPaperLedger,
  mockPaperEquityCurve,
  mockPaperPerformance,
  mockPaperRejectionAnalysis,
  mockPaperRiskDecisions,
  mockPaperRiskPolicy,
  mockPaperReviewQueue,
  mockPaperWallet,
  mockSimulatedOrders,
  mockWalletBalances,
} from "../api/mockData";

describe("WalletBalanceTab", () => {
  it("renders paper-only wallet, ledger, and simulated orders without forbidden copy", () => {
    render(
      <WalletBalanceTab
        rows={mockWalletBalances}
        paperWallet={mockPaperWallet}
        paperLedger={mockPaperLedger}
        paperRiskPolicy={mockPaperRiskPolicy}
        paperRiskDecisions={mockPaperRiskDecisions}
        paperPerformance={mockPaperPerformance}
        paperEquityCurve={mockPaperEquityCurve}
        paperRejectionAnalysis={mockPaperRejectionAnalysis}
        paperReviewQueue={mockPaperReviewQueue}
        simulatedOrders={mockSimulatedOrders}
      />,
    );

    expect(screen.getByRole("heading", { name: "Paper Wallet Ledger" })).toBeInTheDocument();
    expect(screen.getByText("Paper-only simulation")).toBeInTheDocument();
    expect(screen.getByText("Recent Ledger Entries")).toBeInTheDocument();
    expect(screen.getByText("Simulated Orders")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual Simulation Limits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paper Performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paper Equity Curve" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paper Rejections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paper Review Queue" })).toBeInTheDocument();
    expect(screen.getByText(/Paper risk governor accepted this manual simulated order/i)).toBeInTheDocument();
    expect(screen.getByText(/does not invent mark-to-market performance/i)).toBeInTheDocument();
    expect(screen.getByText(/Review paper rejection: symbol_not_trader_facing/i)).toBeInTheDocument();
    expect(screen.getByText(/Research-only blocked:/i)).toBeInTheDocument();
    expect(screen.getAllByText("USOUSD").length).toBeGreaterThan(0);

    const copy = document.body.textContent ?? "";
    expect(copy).not.toMatch(/fake-live|broker-ready|execution-ready|real-money|external routing/i);
  });

  it("renders honest unavailable copy when no paper wallet has loaded", () => {
    render(
      <WalletBalanceTab
        rows={[]}
        paperWallet={null}
        paperLedger={[]}
        paperRiskPolicy={null}
        paperRiskDecisions={[]}
        paperPerformance={null}
        paperEquityCurve={[]}
        paperRejectionAnalysis={[]}
        paperReviewQueue={[]}
        simulatedOrders={[]}
      />,
    );

    expect(screen.getByText(/Wallet details will appear when the local API is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Paper-only risk policy will appear when the local API is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/No paper risk decisions have been recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Paper performance summary will appear when the local API is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/No equity curve points are available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No rejected paper orders have been grouped yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No paper review tasks are open/i)).toBeInTheDocument();
    expect(screen.getByText(/No paper ledger entries are available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No simulated paper orders have been recorded yet/i)).toBeInTheDocument();
  });
});
