import { inflateSync } from 'node:zlib';

// Decode the Chromium PNG screenshot itself, not canvas dimensions or DOM
// presence: a lost WebGL canvas can leave the entire table invisible.
export function samplePngRGB(png, x, y) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('Browser screenshot is not a PNG');
  let width, height, depth, type;
  const payload = [];
  for (let pos = 8; pos + 12 <= png.length;) {
    const length = png.readUInt32BE(pos);
    const tag = png.toString('ascii', pos + 4, pos + 8);
    const start = pos + 8;
    if (start + length + 4 > png.length) throw new Error('Truncated browser screenshot');
    if (tag === 'IHDR') {
      width = png.readUInt32BE(start);
      height = png.readUInt32BE(start + 4);
      depth = png[start + 8]; type = png[start + 9];
    }
    if (tag === 'IDAT') payload.push(png.subarray(start, start + length));
    pos = start + length + 4;
    if (tag === 'IEND') break;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) ||
      !Number.isInteger(x) || !Number.isInteger(y) ||
      x < 0 || y < 0 || x >= width || y >= height)
    throw new Error('Unsupported PNG format or sample position');
  const channels = type === 2 ? 3 : 4;
  const bytesPerRow = width * channels;
  const data = inflateSync(Buffer.concat(payload));
  if (data.length < (bytesPerRow + 1) * height) throw new Error('Truncated PNG pixels');
  let previous = new Uint8Array(bytesPerRow);
  let current = new Uint8Array(bytesPerRow);
  for (let row = 0; row <= y; row++) {
    const offset = row * (bytesPerRow + 1);
    const filter = data[offset];
    for (let i = 0; i < bytesPerRow; i++) {
      const left = i < channels ? 0 : current[i - channels];
      const up = previous[i];
      const upperLeft = i < channels ? 0 : previous[i - channels];
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      } else if (filter !== 0) throw new Error('Unsupported PNG scanline filter');
      current[i] = (data[offset + 1 + i] + predictor) & 255;
    }
    if (row !== y) [previous, current] = [current, previous];
  }
  const at = x * channels;
  return [...current.subarray(at, at + 3)];
}

export function screenshotShowsFelt(png, rect) {
  const xs = [0.32, 0.5, 0.68], ys = [0.40, 0.50, 0.60];
  let green = 0;
  for (const fy of ys) for (const fx of xs) {
    const [r, g, b] = samplePngRGB(png,
      Math.round(rect.x + rect.width * fx), Math.round(rect.y + rect.height * fy));
    if (g >= 55 && g > r * 1.2 && g > b * 1.12) green++;
  }
  return green >= 3;
}
