import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: '#ef4444', background: '#0d1f17', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 10, color: '#f59e0b' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, marginTop: 10, color: '#8faa97' }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 20, padding: '10px 20px', background: '#22c55e', color: '#0d1f17', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
          >
            Clear Data &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
