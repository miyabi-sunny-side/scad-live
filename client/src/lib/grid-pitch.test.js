import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_PITCH,
  GRID_PITCHES,
  GRID_SIZE,
  gridDivisions,
  gridPitchIndex,
} from './grid-pitch.js';

describe('grid pitch', () => {
  it('defaults to 1 mm', () => {
    expect(DEFAULT_GRID_PITCH).toBe(1);
    expect(GRID_PITCHES).toEqual([0.5, 1, 2, 5, 10]);
  });

  it('maps every discrete pitch to integer divisions on a 400 mm plane', () => {
    for (const pitch of GRID_PITCHES) {
      const { minor, major, majorCell, size, cellSize } = gridDivisions(pitch);
      expect(size).toBe(GRID_SIZE);
      expect(cellSize).toBe(pitch);
      expect(majorCell).toBe(pitch * 10);
      expect(Number.isInteger(minor)).toBe(true);
      expect(Number.isInteger(major)).toBe(true);
      expect(size / minor).toBe(pitch);
      expect(size / major).toBe(majorCell);
    }
  });

  it('uses 400 minor and 40 major divisions at the default 1 mm pitch', () => {
    expect(gridDivisions(1)).toMatchObject({
      minor: 400,
      major: 40,
      cellSize: 1,
      majorCell: 10,
    });
  });

  it('resolves the slider index for known and unknown pitches', () => {
    expect(gridPitchIndex(1)).toBe(1);
    expect(gridPitchIndex(0.5)).toBe(0);
    expect(gridPitchIndex(10)).toBe(4);
    expect(gridPitchIndex(1.37)).toBe(1);
  });
});
