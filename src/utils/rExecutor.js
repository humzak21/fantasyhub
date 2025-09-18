import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Utility class for executing R scripts from Node.js
 */
export class RExecutor {
  constructor() {
    this.scriptsPath = path.join(__dirname, '../../scripts/ffanalytics');
  }

  /**
   * Execute an R script with arguments
   * @param {string} scriptName - Name of the R script (without .R extension)
   * @param {Array} args - Arguments to pass to the script
   * @param {number} timeout - Timeout in milliseconds (default: 60000)
   * @returns {Promise<Object>} - Result object with stdout, stderr, and parsed JSON if available
   */
  async executeScript(scriptName, args = [], timeout = 60000) {
    const scriptPath = path.join(this.scriptsPath, `${scriptName}.R`);
    
    return new Promise((resolve, reject) => {
      const rProcess = spawn('Rscript', [scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      rProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      rProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      rProcess.on('close', (code) => {
        const result = {
          success: code === 0,
          code,
          stdout,
          stderr,
          data: null
        };
        
        // Try to parse JSON from stdout
        try {
          const lines = stdout.split('\n');
          const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
          
          if (jsonStart !== -1) {
            const jsonOutput = lines.slice(jsonStart).join('\n');
            result.data = JSON.parse(jsonOutput);
          }
        } catch (e) {
          // JSON parsing failed, that's okay
        }
        
        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`R script failed with code ${code}. stderr: ${stderr}`));
        }
      });
      
      rProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute R code directly
   * @param {string} code - R code to execute
   * @param {number} timeout - Timeout in milliseconds (default: 60000)
   * @returns {Promise<Object>} - Result object with stdout, stderr
   */
  async executeCode(code, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const rProcess = spawn('R', ['--slave', '--no-restore'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      rProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      rProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      rProcess.on('close', (code) => {
        const result = {
          success: code === 0,
          code,
          stdout,
          stderr
        };
        
        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`R code execution failed with code ${code}. stderr: ${stderr}`));
        }
      });
      
      rProcess.on('error', (error) => {
        reject(error);
      });
      
      // Send the R code to the process
      rProcess.stdin.write(code);
      rProcess.stdin.end();
    });
  }

  /**
   * Test if R environment is properly configured
   * @returns {Promise<boolean>} - True if R environment is ready
   */
  async testEnvironment() {
    try {
      const result = await this.executeCode(`
        library(ffanalytics)
        cat("R environment test: SUCCESS")
      `);
      
      return result.success && result.stdout.includes('SUCCESS');
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const rExecutor = new RExecutor();