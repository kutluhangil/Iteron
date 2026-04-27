import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    // Integrate mechanism to report critical errors to a centralized logging service
    this.reportErrorToService(error, errorInfo);
  }

  private reportErrorToService(error: Error, errorInfo: ErrorInfo) {
    // Mock centralized logging service
    const payload = {
        message: error.message,
        stack: error.stack,
        info: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        context: 'p5-canvas-render'
    };
    console.log("[Central Error Logger] Transmitting report...", payload);
    // fetch('https://api.loggingservice.com/report', { method: 'POST', body: JSON.stringify(payload) }).catch(console.error);
  }

  // Allow resetting error state if new props are passed (e.g. new code)
  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.children !== prevProps.children) {
        this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
          <div className="flex flex-col items-center justify-center w-full h-full bg-neutral-950 text-neutral-400 p-4 text-center z-10 absolute inset-0">
              <svg className="w-10 h-10 text-red-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-sm font-bold text-white mb-2">Canvas Render Error</h3>
              {this.state.error && <p className="text-[10px] font-mono text-red-400 mb-4 bg-red-500/10 p-2 rounded max-w-[80vw] text-left overflow-hidden text-ellipsis whitespace-nowrap border border-red-500/20">{this.state.error.message}</p>}
              <p className="text-xs text-neutral-400 max-w-sm mb-4">The generated p5 code crashed. Please check the "Tweaks & Presets" panel to try adjusting the playback speed, or simply click <strong className="text-white">EVOLVE</strong> to try a new generation.</p>
              {this.props.onReset && (
                  <button 
                      onClick={this.props.onReset}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors"
                  >
                      Re-Evolve
                  </button>
              )}
          </div>
      );
    }

    return this.props.children;
  }
}
