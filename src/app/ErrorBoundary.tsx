import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('Application rendering failed', error);
  }
  render() {
    return this.state.failed ? (
      <main className="error-screen">
        <h1>Something interrupted the game.</h1>
        <p>Your saved league data is still in this browser.</p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Reload application
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
