import { mount } from 'svelte';

// Style import order matters:
//   1. reset.css      — base CSS reset, font defaults
//   2. tokens.css     — design tokens (CSS custom properties)
//   3. themes.css     — [data-theme="light"] and prefers-contrast overrides
//   4. layout.css     — global layout helpers (.app-shell, .btn, .panel, .pill)
//   5. responsive.css — token overrides per breakpoint
//   6. animations.css — keyframes
//   7. motion.css     — prefers-reduced-motion override (must be last)
import './styles/reset.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/layout.css';
import './styles/responsive.css';
import './styles/animations.css';
import './styles/motion.css';

import App from './App.svelte';

// Apply persisted theme before first paint to avoid a dark/light flash.
// The storage layer's prefs module namespaces keys as `euchre.pref.<name>`
// and JSON-encodes the value; we read the raw key here to avoid pulling
// the storage module into the critical-path bundle for first paint.
// SettingsModal also writes to documentElement.dataset.theme reactively.
const root = document.documentElement;
if (root.dataset.theme === undefined) {
  let wantsDark = true;
  try {
    const raw = localStorage.getItem('euchre.pref.darkMode');
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'boolean') wantsDark = parsed;
    }
  } catch {
    // localStorage unavailable or corrupt entry — default to dark.
  }
  root.dataset.theme = wantsDark ? 'dark' : 'light';
}

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount target #app not found');
}

const app = mount(App, { target });

export default app;
