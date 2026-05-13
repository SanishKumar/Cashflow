import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-background p-6">
          <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-error text-[32px]">wifi_off</span>
          </div>
          <h2 className="text-[20px] font-semibold text-on-surface mb-2 text-center">Connection Lost</h2>
          <p className="text-[14px] text-on-surface-variant text-center max-w-md mb-8">
            The application experienced an unexpected state error, likely due to a stale connection or sleep cycle.
          </p>
          <button
            onClick={this.handleRefresh}
            className="h-10 px-6 rounded-lg bg-primary text-on-primary text-[14px] font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
