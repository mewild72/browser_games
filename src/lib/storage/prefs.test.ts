/**
 * UI prefs (localStorage) tests.
 *
 * Vitest's jsdom environment provides a working `localStorage`, so these
 * are simple round-trip checks plus the typed-key contract.
 *
 * Owner: indexeddb-expert
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { clearPref, getPref, setPref } from './prefs';

describe('prefs (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns undefined for a missing key', () => {
    expect(getPref('cardBack')).toBeUndefined();
  });

  it('round-trips strings', () => {
    setPref('cardBack', 'classic-blue');
    expect(getPref('cardBack')).toBe('classic-blue');
  });

  it('round-trips booleans without the "false"-string ambiguity', () => {
    setPref('darkMode', false);
    expect(getPref('darkMode')).toBe(false);
    setPref('darkMode', true);
    expect(getPref('darkMode')).toBe(true);
  });

  it('round-trips the difficulty enum', () => {
    setPref('lastDifficulty', 'hard');
    expect(getPref('lastDifficulty')).toBe('hard');
  });

  it('namespaces keys with `euchre.pref.` to avoid collisions', () => {
    setPref('soundOn', true);
    // Anything written without the helper does not pollute the typed read.
    localStorage.setItem('soundOn', 'totally-unrelated');
    expect(getPref('soundOn')).toBe(true);
  });

  it('treats corrupt JSON entries as unset', () => {
    localStorage.setItem('euchre.pref.cardBack', '{not-valid');
    expect(getPref('cardBack')).toBeUndefined();
  });

  it('clearPref removes the value', () => {
    setPref('cardBack', 'red-back');
    clearPref('cardBack');
    expect(getPref('cardBack')).toBeUndefined();
  });
});
