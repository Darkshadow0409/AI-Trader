import { Component, type ReactNode } from "react";
import { StateBlock } from "./StateBlock";

interface ErrorBoundaryProps {
  label: string;
  resetKey?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="stack">
          <StateBlock error={`${this.props.label} failed. ${this.state.error.message || "Check the latest refresh and retry."}`} />
          <button className="text-button" onClick={() => this.setState({ error: null })} type="button">
            Retry Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
