'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

type Props = { children: ReactNode; title: string; retryLabel: string; message: string; onRetry?: () => void };

export class WidgetBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[dashboard:${this.props.title}]`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <WidgetError
        title={this.props.title}
        message={this.props.message}
        retryLabel={this.props.retryLabel}
        onRetry={() => {
          this.setState({ failed: false });
          this.props.onRetry?.();
        }}
      />
    );
  }
}

export function WidgetError({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="dash-card flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCw className="size-3.5" aria-hidden />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
