/** A viewport-local distance field, with bounded resolution and bounded growth.
 * Empty space farther than the influence radius stays empty; interleaved groups
 * compete for nearby cells instead of covering one another with convex hulls. */
export interface TerritoryRaster {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  occupiedCells: number;
}
export type Affine2D = readonly [number, number, number, number, number, number];
const PALETTE = [
  [94, 170, 210],
  [179, 131, 204],
  [83, 184, 154],
  [211, 163, 92],
  [196, 113, 138],
  [128, 156, 218],
];

export function communityColor(id: string): readonly number[] {
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return PALETTE[(hash >>> 0) % PALETTE.length];
}

export function territoryRaster(
  positions: Float32Array,
  membership: Uint32Array,
  sizes: Uint32Array,
  colors: ReadonlyMap<number, readonly number[]>,
  transform: Affine2D,
  viewportWidth: number,
  viewportHeight: number,
): TerritoryRaster {
  const cell = Math.max(6, viewportWidth / 384, viewportHeight / 384);
  const width = Math.max(1, Math.ceil(viewportWidth / cell));
  const height = Math.max(1, Math.ceil(viewportHeight / cell));
  const seeds = new Int32Array(width * height).fill(-1);
  const owners = new Int32Array(width * height).fill(-1);
  const distance = new Uint8Array(width * height).fill(255);
  const seedDistance = new Float32Array(width * height).fill(Infinity);
  const [a, b, c, d, tx, ty] = transform;
  for (let i = 0; i < membership.length; i++) {
    const group = membership[i];
    if (!(sizes[group] > 1)) continue;
    const x = positions[i * 2],
      y = positions[i * 2 + 1];
    const sx = (a * x + c * y + tx) / cell,
      sy = (b * x + d * y + ty) / cell;
    if (
      !Number.isFinite(sx) ||
      !Number.isFinite(sy) ||
      sx < 0 ||
      sy < 0 ||
      sx >= width ||
      sy >= height
    )
      continue;
    const ix = Math.floor(sx),
      iy = Math.floor(sy),
      index = iy * width + ix;
    const dist = (sx - ix - 0.5) ** 2 + (sy - iy - 0.5) ** 2;
    if (dist < seedDistance[index] || (dist === seedDistance[index] && group < seeds[index])) {
      seeds[index] = group;
      seedDistance[index] = dist;
    }
  }
  let occupiedCells = 0;
  for (let i = 0; i < seeds.length; i++) {
    if (seeds[i] < 0) continue;
    occupiedCells++;
    const x = i % width,
      y = Math.floor(i / width);
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        const dist = dx * dx + dy * dy;
        const nx = x + dx,
          ny = y + dy;
        if (dist > 25 || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (dist < distance[j] || (dist === distance[j] && seeds[i] < owners[j])) {
          distance[j] = dist;
          owners[j] = seeds[i];
        }
      }
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < owners.length; i++) {
    const group = owners[i];
    if (group < 0) continue;
    const color = colors.get(group)!;
    const x = i % width;
    const boundary =
      (x > 0 && owners[i - 1] !== group) ||
      (x < width - 1 && owners[i + 1] !== group) ||
      (i >= width && owners[i - width] !== group) ||
      (i < owners.length - width && owners[i + width] !== group);
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = Math.round((boundary ? 75 : 34) * Math.min(1, (26 - distance[i]) / 8));
  }
  return { width, height, pixels, occupiedCells };
}

/** Map a cached viewport image to a new 2D camera without revisiting all nodes. */
export function relativeTransform(from: Affine2D, to: Affine2D): Affine2D {
  const det = from[0] * from[3] - from[1] * from[2];
  const a = (to[0] * from[3] - to[2] * from[1]) / det;
  const b = (to[1] * from[3] - to[3] * from[1]) / det;
  const c = (to[2] * from[0] - to[0] * from[2]) / det;
  const d = (to[3] * from[0] - to[1] * from[2]) / det;
  return [a, b, c, d, to[4] - a * from[4] - c * from[5], to[5] - b * from[4] - d * from[5]];
}
