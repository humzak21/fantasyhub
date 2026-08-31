import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../src/components/ui/button';
import { Card, CardContent } from '../src/components/ui/card';

/**
 * Error Boundary Component for Desktop
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleRefresh = () => {
    // Reset error state and reload the page
    window.location.reload();
  };

  handleReset = () => {
    // Reset error state without reloading
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      // The wrapper used to be `bg-gradient-to-br from-slate-50 to-slate-100`
      // — a near-white gradient behind the error card, on an app that is
      // dark-only. It is why a crash looked like the page had been replaced
      // by a different site.
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full border-destructive/50 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Error Icon */}
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>

                {/* Error Title */}
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">
                    Something went wrong
                  </h2>
                  <p className="text-muted-foreground">
                    We're sorry, but something unexpected happened. Please try refreshing the page.
                  </p>
                </div>

                {/* Error Details (only in development) */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="w-full text-left">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                      Technical Details
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded-md text-xs font-mono overflow-auto max-h-40">
                      <p className="text-destructive font-semibold mb-2">
                        {this.state.error.toString()}
                      </p>
                      {this.state.errorInfo && (
                        <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  </details>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 w-full">
                  <Button
                    onClick={this.handleRefresh}
                    className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    size="lg"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Page
                  </Button>
                  {process.env.NODE_ENV === 'development' && (
                    <Button
                      onClick={this.handleReset}
                      variant="outline"
                      size="lg"
                    >
                      Try Again
                    </Button>
                  )}
                </div>

                {/* Additional Help Text */}
                <p className="text-xs text-muted-foreground">
                  If this problem persists, please contact support or try again later.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error handler for functional components
 * Catches runtime errors and unhandled promise rejections
 */
export function useErrorHandler() {
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const handleError = (event) => {
      console.error('Global error caught:', event.error);
      setError(event.error);
    };

    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      setError(new Error(event.reason || 'Unhandled promise rejection'));
    };

    // Add global error listeners
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  return { error, resetError };
}

/**
 * Component-level error fallback
 * For use with smaller components that need their own error handling
 */
export function ErrorFallback({ error, resetError, componentName = 'component' }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              Error loading {componentName}
            </h3>
            <p className="text-sm text-muted-foreground">
              Something went wrong while loading this section.
            </p>
          </div>

          {process.env.NODE_ENV === 'development' && error && (
            <details className="w-full text-left">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Error Details
              </summary>
              <div className="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-auto max-h-32">
                <p className="text-destructive">{error.toString()}</p>
              </div>
            </details>
          )}

          <Button
            onClick={resetError || (() => window.location.reload())}
            variant="destructive"
            size="sm"
            className="w-full"
          >
            <RefreshCw className="mr-2 h-3 w-3" />
            Try Again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ErrorBoundary;

