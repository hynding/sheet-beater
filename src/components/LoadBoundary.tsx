import { Component, type ReactNode } from 'react';

interface LoadBoundaryProps {
  children: ReactNode;
  /** Leave the failed screen without reloading. */
  onBack: () => void;
}

interface LoadBoundaryState {
  failed: boolean;
}

/**
 * Catches a screen that could not be loaded (the notation code is fetched on
 * demand and the network can fail) or that crashed while drawing, and offers
 * a way out instead of leaving a blank page.
 */
export class LoadBoundary extends Component<LoadBoundaryProps, LoadBoundaryState> {
  state: LoadBoundaryState = { failed: false };

  static getDerivedStateFromError(): LoadBoundaryState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen loading" role="alert">
        <p>This screen could not be loaded.</p>
        <p className="muted small">Check your connection and try again.</p>
        <div className="loading__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              this.setState({ failed: false });
              this.props.onBack();
            }}
          >
            Back
          </button>
          {/* A failed code download stays failed until the page is loaded again. */}
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
