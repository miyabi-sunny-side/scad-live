/** Fixed ground-plane extent in millimetres (scene units). */
export const GRID_SIZE = 400;

/** Major lines every N minor cells (decimal-friendly). */
export const MAJOR_RATIO = 10;

/** Discrete pitches a machinist actually wants, in mm. */
export const GRID_PITCHES = Object.freeze([0.5, 1, 2, 5, 10]);

export const DEFAULT_GRID_PITCH = 1;

export function gridPitchIndex(pitch) {
  const index = GRID_PITCHES.indexOf(pitch);
  return index === -1 ? GRID_PITCHES.indexOf(DEFAULT_GRID_PITCH) : index;
}

/**
 * Integer division counts for a pitch that divides GRID_SIZE evenly.
 * @param {number} pitch minor cell size in mm
 * @param {number} [size]
 */
export function gridDivisions(pitch, size = GRID_SIZE) {
  const majorCell = pitch * MAJOR_RATIO;
  const minor = size / pitch;
  const major = size / majorCell;
  if (!Number.isInteger(minor) || !Number.isInteger(major)) {
    throw new Error(`grid pitch ${pitch} mm does not divide size ${size}`);
  }
  return Object.freeze({
    size,
    minor,
    major,
    majorCell,
    cellSize: pitch,
  });
}
