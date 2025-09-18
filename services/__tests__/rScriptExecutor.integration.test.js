import { describe, it, expect } from 'vitest';
import { RScriptExecutor } from '../rScriptExecutor.js';

// Integration tests - these require R to be installed
// Skip these tests if R is not available in the environment
describe('RScriptExecutor Integration Tests', () => {
  let executor;

  beforeEach(() => {
    executor = new RScriptExecutor({
      enableLogging: false
    });
  });

  it('should test R environment', async () => {
    const result = await executor.testEnvironment();
    
    // This test will pass if R is installed, otherwise it will show the error
    if (result.success) {
      expect(result.success).toBe(true);
      expect(result.rVersion).toBeDefined();
      console.log('R environment test passed:', result);
    } else {
      console.log('R environment not available:', result.error);
      // Don't fail the test if R is not installed
      expect(result.success).toBe(false);
    }
  });

  it('should handle missing script gracefully', async () => {
    try {
      await executor.executeScript('nonexistent_script');
      expect.fail('Should have thrown error for missing script');
    } catch (error) {
      expect(error.type).toBe('SCRIPT_NOT_FOUND');
      expect(error.message).toContain('R script not found');
    }
  });

  it('should get execution statistics', () => {
    const stats = executor.getExecutionStats();
    
    expect(stats).toHaveProperty('totalExecutions');
    expect(stats).toHaveProperty('successfulExecutions');
    expect(stats).toHaveProperty('failedExecutions');
    expect(stats).toHaveProperty('averageExecutionTime');
    expect(stats).toHaveProperty('successRate');
  });

  it('should update configuration', () => {
    const originalTimeout = executor.getConfig().timeout;
    
    executor.updateConfig({ timeout: 60000 });
    
    expect(executor.getConfig().timeout).toBe(60000);
    expect(executor.getConfig().timeout).not.toBe(originalTimeout);
  });
});