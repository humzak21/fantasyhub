import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'child_process';
import { RScriptExecutor, RScriptError, R_ERROR_TYPES } from '../rScriptExecutor.js';
import fs from 'fs/promises';

// Mock child_process spawn
vi.mock('child_process');
vi.mock('fs/promises');

describe('RScriptExecutor', () => {
  let executor;
  let mockProcess;

  beforeEach(() => {
    executor = new RScriptExecutor({
      enableLogging: false, // Disable logging for tests
      timeout: 5000,
      maxRetries: 2
    });

    // Mock process object
    mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      killed: false
    };

    spawn.mockReturnValue(mockProcess);
    fs.access.mockResolvedValue(); // Script exists by default
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultExecutor = new RScriptExecutor();
      const config = defaultExecutor.getConfig();
      
      expect(config.rExecutable).toBe('Rscript');
      expect(config.timeout).toBe(300000);
      expect(config.maxRetries).toBe(3);
      expect(config.enableLogging).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customExecutor = new RScriptExecutor({
        rExecutable: 'custom-r',
        timeout: 10000,
        maxRetries: 5
      });
      
      const config = customExecutor.getConfig();
      expect(config.rExecutable).toBe('custom-r');
      expect(config.timeout).toBe(10000);
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('executeScript', () => {
    it('should execute R script successfully', async () => {
      const mockStdout = '{"result": "success", "data": [1,2,3]}';
      const mockStderr = '';

      // Setup mock process behavior
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockStdout), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockStderr), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20); // Success exit code
        }
      });

      const result = await executor.executeScript('test_script', ['arg1', 'arg2']);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success', data: [1, 2, 3] });
      expect(result.executionId).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle script execution failure', async () => {
      const mockStderr = 'Error: Script failed';

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockStderr), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 20); // Error exit code
        }
      });

      await expect(executor.executeScript('failing_script')).rejects.toThrow(RScriptError);
    });

    it('should handle timeout configuration', () => {
      const shortTimeoutExecutor = new RScriptExecutor({
        enableLogging: false,
        timeout: 100
      });

      const config = shortTimeoutExecutor.getConfig();
      expect(config.timeout).toBe(100);
    });

    it('should have retry configuration', () => {
      const config = executor.getConfig();
      expect(config.maxRetries).toBe(2);
      expect(config.retryDelay).toBeDefined();
    });

    it('should validate script exists', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(executor.executeScript('nonexistent_script')).rejects.toThrow(RScriptError);
      
      const error = await executor.executeScript('nonexistent_script').catch(e => e);
      expect(error.type).toBe(R_ERROR_TYPES.SCRIPT_NOT_FOUND);
    });
  });

  describe('data parsing', () => {
    it('should parse JSON output correctly', async () => {
      const mockStdout = 'Some R output\n{"players": [{"name": "Player1", "points": 15.5}]}\nMore output';

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockStdout), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });

      const result = await executor.executeScript('data_script');
      expect(result.data).toEqual({
        players: [{ name: 'Player1', points: 15.5 }]
      });
    });

    it('should handle non-JSON output', async () => {
      const mockStdout = 'Simple text output\nNo JSON here';

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockStdout), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });

      const result = await executor.executeScript('text_script');
      expect(result.data).toEqual({
        type: 'raw',
        lines: ['Simple text output', 'No JSON here'],
        raw: mockStdout
      });
    });
  });

  describe('ffanalytics-specific methods', () => {
    beforeEach(() => {
      // Setup successful execution mock
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('{"success": true}'), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });
    });

    it('should scrape weekly projections', async () => {
      const result = await executor.scrapeProjections(['ESPN', 'CBS'], ['QB', 'RB'], 2024, 1);
      
      expect(spawn).toHaveBeenCalledWith(
        'Rscript',
        expect.arrayContaining([
          expect.stringContaining('scrape_weekly_projections.R'),
          '--sources', 'ESPN,CBS',
          '--positions', 'QB,RB',
          '--season', '2024',
          '--week', '1'
        ]),
        expect.any(Object)
      );
      
      expect(result.success).toBe(true);
    });

    it('should scrape season projections', async () => {
      const result = await executor.scrapeProjections(['ESPN'], ['QB'], 2024, 0);
      
      expect(spawn).toHaveBeenCalledWith(
        'Rscript',
        expect.arrayContaining([
          expect.stringContaining('scrape_season_projections.R'),
          '--sources', 'ESPN',
          '--positions', 'QB',
          '--season', '2024',
          '--week', '0'
        ]),
        expect.any(Object)
      );
    });

    it('should add ECR to projections data', async () => {
      const projectionsData = { players: [] };
      const result = await executor.addECR(projectionsData);
      
      expect(spawn).toHaveBeenCalledWith(
        'Rscript',
        expect.arrayContaining([
          expect.stringContaining('process_analytics_data.R'),
          '--add-ecr',
          '--data', JSON.stringify(projectionsData)
        ]),
        expect.any(Object)
      );
    });

    it('should add ADP to projections data', async () => {
      const projectionsData = { players: [] };
      const result = await executor.addADP(projectionsData, ['ESPN', 'Yahoo']);
      
      expect(spawn).toHaveBeenCalledWith(
        'Rscript',
        expect.arrayContaining([
          expect.stringContaining('process_analytics_data.R'),
          '--add-adp',
          '--adp-sources', 'ESPN,Yahoo',
          '--data', JSON.stringify(projectionsData)
        ]),
        expect.any(Object)
      );
    });
  });

  describe('statistics and monitoring', () => {
    it('should track execution statistics', async () => {
      // Setup successful execution
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('{}'), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });

      await executor.executeScript('test_script');
      
      const stats = executor.getExecutionStats();
      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.successRate).toBe(100);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should reset statistics', () => {
      executor.resetStats();
      
      const stats = executor.getExecutionStats();
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      executor.updateConfig({ timeout: 60000, maxRetries: 5 });
      
      const config = executor.getConfig();
      expect(config.timeout).toBe(60000);
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('environment testing', () => {
    it('should test R environment successfully', async () => {
      const mockStdout = 'R version 4.3.0\nffanalytics package loaded successfully\nEnvironment test completed successfully';

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockStdout), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });

      const result = await executor.testEnvironment();
      
      expect(result.success).toBe(true);
      expect(result.rVersion).toBe('4.3.0');
      expect(result.ffanalyticsAvailable).toBe(true);
    });

    it('should handle environment test failure', async () => {
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(''), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('ffanalytics package not found'), 10);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 20);
        }
      });

      const result = await executor.testEnvironment();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});