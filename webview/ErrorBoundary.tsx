import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMsg: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 20,
            color: 'red',
            backgroundColor: '#fee2e2',
            height: '100vh',
            width: '100vw',
          }}
        >
          <h2>WebView Error</h2>
          <p style={{ fontFamily: 'monospace' }}>{this.state.errorMsg}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
