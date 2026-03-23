import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockAdapterHealth, mockAuditLogs, mockExecutionGate, mockPilotDashboard } from "../api/mockData";
import { PilotDashboardTab } from "./PilotDashboardTab";

describe("PilotDashboardTab", () => {
  it("renders pilot metrics, gate blockers, adapter health, and audit logs", () => {
    render(
      <PilotDashboardTab
        adapterHealth={mockAdapterHealth}
        auditLogs={mockAuditLogs}
        dashboard={mockPilotDashboard}
        executionGate={mockExecutionGate}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pilot Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trust By Asset Class" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Execution Gate" })).toBeInTheDocument();
    expect(screen.getByText("Pilot Running")).toBeInTheDocument();
    expect(screen.getByText(/approved ticket conversion is below pilot threshold/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Adapter Health" })).toBeInTheDocument();
    expect(screen.getByText("mock_broker")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByText("ticket_approval")).toBeInTheDocument();
  });

  it("renders the empty divergence state when no hotspots exist", () => {
    render(
      <PilotDashboardTab
        adapterHealth={mockAdapterHealth}
        auditLogs={mockAuditLogs}
        dashboard={{ ...mockPilotDashboard, divergence_hotspots: [] }}
        executionGate={mockExecutionGate}
      />,
    );

    expect(screen.getByText("No current divergence hotspots.")).toBeInTheDocument();
  });
});
