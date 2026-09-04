import { Component } from 'react';

// Without this, any uncaught render error anywhere in the tree makes
// React unmount everything with no trace on screen - just a blank
// (effectively black, given our dark background) page and no way for
// a student to tell us what happened without already having devtools
// open. This catches it and shows the actual error + stack right in
// the UI instead, with a reload button, so a screenshot is enough to
// diagnose it.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('Uncaught render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 14,
            padding: 24,
            background: '#060818',
            color: '#fff',
            fontFamily: 'monospace',
          }}
        >
          <div style={{ fontSize: 22 }}>⚠️ Something went wrong</div>
          <div style={{ fontSize: 13, color: '#ff5a7a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          {this.state.error?.stack && (
            <pre
              style={{
                fontSize: 10.5,
                color: '#8aaed0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '40vh',
                overflowY: 'auto',
                background: 'rgba(255,255,255,0.05)',
                padding: 12,
                borderRadius: 10,
                width: '100%',
              }}
            >
              {this.state.error.stack}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(90deg, #00e5ff, #a78bfa)',
              color: '#000',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
