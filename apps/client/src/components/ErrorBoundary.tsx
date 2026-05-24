import React from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="w-full p-6 rounded-lg bg-destructive/10 border-2 border-dashed border-destructive/20 flex flex-col items-center justify-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-destructive">
              Failed to render content
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
