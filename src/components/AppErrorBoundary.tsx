'use client';
// Class error boundary, so a render crash logs the error AND its component
// stack. Next's error.tsx only receives the error (plus a digest), which is not
// enough to find a client-side crash that never reaches the server. The UI is
// the same calm screen as error.tsx — nothing a user sees changed.
import React from 'react';
import AppErrorView from './AppErrorView';

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Raw error and stack to the console only; never rendered.
    console.error('[app-error] render crash', error);
    console.error('[app-error] component stack', info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <AppErrorView onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}
