import { createContext, useContext, useEffect } from 'react';

/**
 * The app is dark-only, by design.
 *
 * This file used to be 251 lines of light-mode machinery with the light half
 * commented out: a `useState(true)` marked "FORCED", a 50-line preference
 * reader fenced between `DISABLED_LIGHT_MODE_START/END` markers, three action
 * functions whose bodies were entirely comments, two effects still writing
 * constants to localStorage, a matchMedia listener that could never fire, and
 * a `resetToDefaults` that was *not* disabled and would have set light mode —
 * escaping the lock the rest of the file existed to enforce.
 *
 * None of that was a theme system. It was the residue of one. The decision is
 * stated here instead: one theme, defined in globals.css, applied once.
 *
 * The `dark` class stays on <html> rather than being dropped in favour of
 * plain `:root` rules, because two things still depend on it — the
 * `@custom-variant dark` any remaining `dark:` utility compiles against, and
 * the status-colour remap block in globals.css, which is `.dark`-scoped and
 * is still load-bearing for a few hundred light-tint utilities in the feature
 * components.
 *
 * If light mode is ever wanted, it is a new piece of work — the `:root`
 * palette in globals.css is a fallback so tokens always resolve, not a
 * designed second theme.
 */
const DarkModeContext = createContext();

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
};

/** The value is constant; there is nothing to subscribe to. */
const VALUE = Object.freeze({
  isDarkMode: true,
  isInitialized: true,
  getThemeName: () => 'Dark',
});

export const DarkModeProvider = ({ children }) => {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return <DarkModeContext.Provider value={VALUE}>{children}</DarkModeContext.Provider>;
};
