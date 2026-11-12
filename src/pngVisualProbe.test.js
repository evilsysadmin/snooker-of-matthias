import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readPngRgbRect, samplePngRGB } from '../e2e/pngFeltProbe.mjs';

function chunk(name, bytes) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, Buffer.from(name), bytes, Buffer.alloc(4)]);
}
test('pixel screenshot reader decodes exact RGB patches and protects bounds', () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 2; // RGB
  const rows = Buffer.from([
    0, 255, 0, 0, 0, 255, 0, // red, green
    0, 0, 0, 255, 255, 255, 255, // blue, white
  ]);
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.deepEqual([...readPngRgbRect(png, { x: 1, y: 0, width: 1, height: 2 })],
    [0, 255, 0, 255, 255, 255]);
  assert.deepEqual(samplePngRGB(png, 0, 1), [0, 0, 255]);
  assert.throws(() => readPngRgbRect(png, { x: -1, y: 0, width: 2, height: 1 }));
  assert.throws(() => readPngRgbRect(png, { x: 0, y: 1, width: 1, height: 2 }));
});
