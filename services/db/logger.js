/**
 * Dev-gated logging for the data layer.
 *
 * `debug` and `info` are silent in production builds; `warn` and `error` always
 * emit. Everything is scoped so a line can be traced back to the module that
 * wrote it without the message having to repeat the module name.
 *
 *     const log = createLogger('db:games');
 *     log.debug('fetched %d games', games.length);
 */

import { isDevEnvironment } from './env.js';

let enabled = null;

/** Memoised so the env lookup does not happen on every log call. */
const debugEnabled = () => {
  if (enabled === null) enabled = isDevEnvironment();
  return enabled;
};

/** Test seam: force debug output on or off, or pass null to re-resolve. */
export function setDebugEnabled(value) {
  enabled = value;
}

export function createLogger(scope) {
  const prefix = `[${scope}]`;
  return {
    debug: (...args) => {
      if (debugEnabled()) console.debug(prefix, ...args);
    },
    info: (...args) => {
      if (debugEnabled()) console.info(prefix, ...args);
    },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    child: (childScope) => createLogger(`${scope}:${childScope}`)
  };
}

export const logger = createLogger('db');
