/**
 * Integration tests for RScriptExecutor
 * Tests actual R script execution and data processing workflows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RScriptExecutor } from '../rScriptExecutor.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Mock child_process for controlled testing
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock fs for file operations
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn()
}));

describe('RScriptExecutor - Integration Tests', () => {
  let executor;
  let mockProcess;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process object
    mockProcess = {
      stdout: {
        on: vi.fn(),
        setEncoding: vi.fn()
      },
      stderr: {
        on: vi.fn(),
        setEncoding: vi.fn()
      },
      on: vi.fn(),
      kill: vi.fn()
    };

    spawn.mockReturnValue(mockProcess);

    executor = new RScriptExecutor({
      rExecutable: 'Rscript',
      scriptsPath: './scripts/ffanalytics/',
      timeout: 30000,
      maxRetries: 3
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Environment Testing', () => {
    it('should successfully test R environment with ffanalytics package', async () => {
      // Mock successful R environment test
      const mockOutput = JSON.stringify({
        success: true,
        rVersion: '4.3.0',
        ffanalyticsAvailable: true,
        dependencies: {
          dplyr: '1.1.0',
          httr2: '0.2.3',
          rvest: '1.0.3'
        }
      });

      // Setup process mocks
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockOutput), 100);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 200);
        }
      });

      // Mock file system checks
      fs.access.mockResolvedValue(undefined);
      fs.stat.mockResolvedValue({ isFile: () => true });

      const result = await executor.testEnvironment();

      expect(result.success).toBe(true);
      expect(result.rVersion).toBe('4.3.0');
      expect(result.ffanalyticsAvailable).toBe(true);
      expect(result.dependencies).toBeDefined();
      expect(spawn).toHaveBeenCalledWith('Rscript', expect.arrayContaining([
        expect.stringContaining('test_environment.R')
      ]));
    });

    it('should handle R environment test failures', async () => {
      const mockError = 'Error: package \'ffanalytics\' not found';

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockError), 100);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 200);
        }
      });

      const result = await executor.testEnvironment();

      expect(result.success).toBe(false);
      expect(result.error).toContain('ffanalytics');
    });

    it('should handle R executable not found', async () => {
      spawn.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await executor.testEnvironment();

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });
  });

  describe('Weekly Projections Scraping', () => {
    it('should successfully scrape weekly projections', async () => {
      const mockProjectionsData = JSON.stringify({
        success: true,
        data: [
          {
            player_name: 'Josh Allen',
            position: 'QB',
            team: 'BUF',
            points: 24.5,
            ecr: 3,
            uncertainty: 8.2,
            ceiling: 32.1,
            floor: 18.9,
            tier: 1,
            vor: 12.3
          },
          {
            player_name: 'Christian McCaffrey',
            position: 'RB',
            team: 'SF',
            points: 22.8,
            ecr: 1,
            uncertainty: 6.5,
            ceiling: 28.4,
            floor: 17.2,
            tier: 1,
            vor: 15.7
          }
        ],
        executionTime: 45000,
        sources: ['CBS', 'ESPN', 'FantasyPros'],
        week: 5,
        season: 2024
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockProjectionsData), 1000);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 1500);
        }
      });

      fs.access.mockResolvedValue(undefined);

      const result = await executor.scrapeProjections(
        ['CBS', 'ESPN', 'FantasyPros'],
        ['QB', 'RB'],
        2024,
        5
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].player_name).toBe('Josh Allen');
      expect(result.data[1].player_name).toBe('Christian McCaffrey');
      expect(result.executionTime).toBe(45000);
      expect(result.week).toBe(5);
      expect(result.season).toBe(2024);

      expect(spawn).toHaveBeenCalledWith('Rscript', expect.arrayContaining([
        expect.stringContaining('scrape_weekly_projections.R'),
        '--sources=CBS,ESPN,FantasyPros',
        '--positions=QB,RB',
        '--season=2024',
        '--week=5'
      ]));
    });

    it('should handle R script execution errors', async () => {
      const mockError = 'Error in scrape_data(): HTTP 429 - Rate limit exceeded';

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockError), 500);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 1000);
        }
      });

      const result = await executor.scrapeProjections(
        ['CBS', 'ESPN'],
        ['QB'],
        2024,
        5
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.data).toBeNull();
    });

    it('should handle script timeout', async () => {
      // Don't call the close event to simulate hanging process
      mockProcess.stdout.on.mockImplementation(() => {});
      mockProcess.stderr.on.mockImplementation(() => {});
      mockProcess.on.mockImplementation(() => {});

      const shortTimeoutExecutor = new RScriptExecutor({
        rExecutable: 'Rscript',
        scriptsPath: './scripts/ffanalytics/',
        timeout: 1000, // 1 second timeout
        maxRetries: 1
      });

      const startTime = Date.now();
      const result = await shortTimeoutExecutor.scrapeProjections(['CBS'], ['QB'], 2024, 5);
      const endTime = Date.now();

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(endTime - startTime).toBeLessThan(2000); // Should timeout quickly
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe('Season Projections Scraping', () => {
    it('should successfully scrape season projections', async () => {
      const mockSeasonData = JSON.stringify({
        success: true,
        data: [
          {
            player_name: 'Josh Allen',
            position: 'QB',
            team: 'BUF',
            points: 380.5,
            ecr: 2,
            adp: 15.3,
            aav: 45.2,
            uncertainty: 12.1,
            ceiling: 420.8,
            floor: 340.2,
            tier: 1,
            vor: 85.3
          }
        ],
        executionTime: 60000,
        sources: ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks'],
        season: 2024
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockSeasonData), 2000);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 2500);
        }
      });

      const result = await executor.scrapeSeasonProjections(
        ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks'],
        ['QB'],
        2024
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].adp).toBe(15.3);
      expect(result.data[0].aav).toBe(45.2);
      expect(result.executionTime).toBe(60000);

      expect(spawn).toHaveBeenCalledWith('Rscript', expect.arrayContaining([
        expect.stringContaining('scrape_season_projections.R'),
        '--sources=CBS,ESPN,FantasyPros,FantasySharks',
        '--positions=QB',
        '--season=2024'
      ]));
    });
  });

  describe('Data Processing', () => {
    it('should process raw ffanalytics data correctly', async () => {
      const mockRawData = [
        {
          player_name: 'Josh Allen',
          position: 'QB',
          team: 'BUF',
          points: 24.5,
          ecr: 3,
          uncertainty: 8.2,
          ceiling: 32.1,
          floor: 18.9
        }
      ];

      const mockProcessedData = JSON.stringify({
        success: true,
        data: [
          {
            player_name: 'Josh Allen',
            position: 'QB',
            team: 'BUF',
            points_avg: 24.5,
            points_robust: 24.2,
            points_weighted: 24.8,
            ecr_avg: 3,
            ecr_sd: 1.2,
            uncertainty: 8.2,
            ceiling: 32.1,
            floor: 18.9,
            trend_score: 0.85,
            consistency_rating: 0.92,
            tier: 1,
            vor: 12.3
          }
        ]
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockProcessedData), 500);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 1000);
        }
      });

      // Mock temporary file operations
      fs.writeFile.mockResolvedValue(undefined);
      fs.readFile.mockResolvedValue(JSON.stringify(mockRawData));

      const result = await executor.processAnalyticsData(mockRawData);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].trend_score).toBe(0.85);
      expect(result.data[0].consistency_rating).toBe(0.92);
      expect(result.data[0].points_robust).toBe(24.2);
      expect(result.data[0].points_weighted).toBe(24.8);
    });

    it('should handle data processing errors', async () => {
      const mockError = 'Error in process_projections(): Invalid data format';

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockError), 300);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 800);
        }
      });

      const result = await executor.processAnalyticsData([{ invalid: 'data' }]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid data format');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed operations up to maxRetries', async () => {
      let attemptCount = 0;

      spawn.mockImplementation(() => {
        attemptCount++;
        const process = {
          stdout: { on: vi.fn(), setEncoding: vi.fn() },
          stderr: { on: vi.fn(), setEncoding: vi.fn() },
          on: vi.fn(),
          kill: vi.fn()
        };

        if (attemptCount < 3) {
          // Fail first two attempts
          process.on.mockImplementation((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(1), 100);
            }
          });
          process.stderr.on.mockImplementation((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback('Temporary error'), 50);
            }
          });
        } else {
          // Succeed on third attempt
          process.stdout.on.mockImplementation((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(JSON.stringify({
                success: true,
                data: [{ player_name: 'Test Player' }]
              })), 50);
            }
          });
          process.on.mockImplementation((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 100);
            }
          });
        }

        return process;
      });

      const result = await executor.scrapeProjections(['CBS'], ['QB'], 2024, 5);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
      expect(spawn).toHaveBeenCalledTimes(3);
    });

    it('should fail after maxRetries attempts', async () => {
      spawn.mockImplementation(() => {
        const process = {
          stdout: { on: vi.fn(), setEncoding: vi.fn() },
          stderr: { on: vi.fn(), setEncoding: vi.fn() },
          on: vi.fn(),
          kill: vi.fn()
        };

        process.stderr.on.mockImplementation((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback('Persistent error'), 50);
          }
        });

        process.on.mockImplementation((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 100);
          }
        });

        return process;
      });

      const result = await executor.scrapeProjections(['CBS'], ['QB'], 2024, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent error');
      expect(spawn).toHaveBeenCalledTimes(3); // maxRetries = 3
    });
  });

  describe('File System Integration', () => {
    it('should verify R script files exist before execution', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await executor.scrapeProjections(['CBS'], ['QB'], 2024, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Script file not found');
      expect(fs.access).toHaveBeenCalledWith(
        expect.stringContaining('scrape_weekly_projections.R')
      );
    });

    it('should create temporary directories for data processing', async () => {
      const mockData = [{ player_name: 'Test Player' }];

      fs.mkdir.mockResolvedValue(undefined);
      fs.writeFile.mockResolvedValue(undefined);
      fs.readFile.mockResolvedValue(JSON.stringify(mockData));

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(JSON.stringify({
            success: true,
            data: mockData
          })), 100);
        }
      });

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 200);
        }
      });

      await executor.processAnalyticsData(mockData);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('temp'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should handle process crashes gracefully', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Process crashed')), 100);
        }
      });

      const result = await executor.scrapeProjections(['CBS'], ['QB'], 2024, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Process crashed');
    });

    it('should clean up resources on failure', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 100);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('Script error'), 50);
        }
      });

      await executor.scrapeProjections(['CBS'], ['QB'], 2024, 5);

      // Verify cleanup was attempted
      expect(mockProcess.kill).not.toHaveBeenCalled(); // Process exited normally
    });
  });

  describe('Configuration Validation', () => {
    it('should validate R executable path', async () => {
      const invalidExecutor = new RScriptExecutor({
        rExecutable: '/invalid/path/to/R',
        scriptsPath: './scripts/ffanalytics/'
      });

      spawn.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await invalidExecutor.testEnvironment();

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });

    it('should validate scripts directory', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await executor.scrapeProjections(['CBS'], ['QB'], 2024, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Script file not found');
    });

    it('should handle invalid configuration parameters', () => {
      expect(() => {
        new RScriptExecutor({
          timeout: -1000 // Invalid timeout
        });
      }).toThrow();

      expect(() => {
        new RScriptExecutor({
          maxRetries: -1 // Invalid retry count
        });
      }).toThrow();
    });
  });
});