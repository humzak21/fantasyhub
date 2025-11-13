import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorTester Component - FOR TESTING ONLY
 * This component is used to test error boundaries in development
 * Remove or disable in production
 */
const ErrorTester = () => {
  const [shouldCrash, setShouldCrash] = useState(false);

  // This will cause a render error that the error boundary can catch
  if (shouldCrash) {
    throw new Error('This is a test error to verify error boundary functionality');
  }

  return (
    <Card className="border-orange-300">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <CardTitle className="text-orange-900">Error Boundary Tester</CardTitle>
        </div>
        <CardDescription>
          This is a testing component to verify error boundaries are working correctly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click the button below to trigger a component crash. The error boundary should catch it
            and display a fallback UI with a red refresh button.
          </p>
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="text-xs text-orange-800 mb-2 font-semibold">
              ⚠️ Development Testing Only
            </p>
            <p className="text-xs text-orange-700">
              This component should be removed or disabled in production builds.
            </p>
          </div>

          <Button
            onClick={() => setShouldCrash(true)}
            variant="destructive"
            className="w-full"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Trigger Test Error
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ErrorTester;

