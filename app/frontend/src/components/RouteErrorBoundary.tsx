import React from 'react';
import { Button } from '@/components/ui/button';

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  resetKey: string;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

export default class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected render error',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('Route rendering error:', error);
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: null });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-5 space-y-3">
          <h1 className="text-lg font-semibold">Page failed to render</h1>
          <p className="text-sm text-muted-foreground">
            A route error was contained so the app stays usable.
          </p>
          {this.state.message ? (
            <p className="text-xs text-muted-foreground break-words">
              Error: {this.state.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}>
              Back
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
