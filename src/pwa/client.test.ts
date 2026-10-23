import { describe, it, expect } from 'vitest';
import { excludedPwaBrowser, isIosDevice } from './client';
describe('PWA device boundaries', () => {
  it('excludes office TVs and old Chrome without excluding modern mobile browsers', () => {
    expect(excludedPwaBrowser('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/53.0')).toBe(true);
    expect(excludedPwaBrowser('Mozilla/5.0 Chrome/53.0')).toBe(true);
    expect(excludedPwaBrowser('Mozilla/5.0 Android Chrome/120.0')).toBe(false);
  });
  it('recognizes iPhone and desktop-mode iPad instructions', () => {
    expect(isIosDevice('iPhone OS 18_0', 1)).toBe(true);
    expect(isIosDevice('Macintosh Safari', 5)).toBe(true);
    expect(isIosDevice('Macintosh Safari', 0)).toBe(false);
    expect(isIosDevice('Android', 5)).toBe(false);
  });
});
