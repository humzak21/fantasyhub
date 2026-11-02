import { describe, it, expect } from 'vitest';

import { MAX_SOURCE_BYTES, centreSquare, describeAvatarFile } from '../avatarImage.js';

describe('centreSquare', () => {
  it('keeps the middle of a portrait photo', () => {
    expect(centreSquare(3000, 4000)).toEqual({ sx: 0, sy: 500, side: 3000 });
  });

  it('keeps the middle of a landscape photo', () => {
    expect(centreSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
  });

  it('leaves a square alone', () => {
    expect(centreSquare(800, 800)).toEqual({ sx: 0, sy: 0, side: 800 });
  });
});

describe('describeAvatarFile', () => {
  it('accepts an image', () => {
    expect(describeAvatarFile({ type: 'image/jpeg', size: 4_000_000 })).toBeNull();
  });

  it('refuses anything else', () => {
    expect(describeAvatarFile({ type: 'application/pdf', size: 100 })).toMatch(/image/);
    expect(describeAvatarFile(undefined)).toMatch(/image/);
  });

  it('refuses a file too large to decode on a phone', () => {
    expect(describeAvatarFile({ type: 'image/png', size: MAX_SOURCE_BYTES + 1 })).toMatch(/15 MB/);
  });
});
