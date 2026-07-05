import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { deflateSync } from 'node:zlib';

const root = process.cwd();
const scale = 4;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function encodePng(width, height, pixels) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    pixels.copy(rows, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const clampedX = Math.max(left + radius, Math.min(x, right - radius));
  const clampedY = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - clampedX) ** 2 + (y - clampedY) ** 2 <= radius ** 2;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = ((yi > y) !== (yj > y))
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function render(size) {
  const large = size * scale;
  const pixels = Buffer.alloc(large * large * 4);
  const set = (x, y, color) => {
    const offset = (y * large + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };

  for (let y = 0; y < large; y += 1) {
    for (let x = 0; x < large; x += 1) {
      if (insideRoundedRect(x, y, 0, 0, large - 1, large - 1, large * 0.22)) {
        set(x, y, [18, 35, 63, 255]);
      }
    }
  }

  const page = {
    bottom: large * 0.78,
    left: large * 0.23,
    right: large * 0.68,
    top: large * 0.17,
  };
  const fold = large * 0.14;
  const pageShape = [
    [page.left, page.top],
    [page.right - fold, page.top],
    [page.right, page.top + fold],
    [page.right, page.bottom],
    [page.left, page.bottom],
  ];
  for (let y = 0; y < large; y += 1) {
    for (let x = 0; x < large; x += 1) {
      if (insidePolygon(x, y, pageShape)) set(x, y, [247, 250, 255, 255]);
      if (insidePolygon(x, y, [
        [page.right - fold, page.top],
        [page.right - fold, page.top + fold],
        [page.right, page.top + fold],
      ])) set(x, y, [190, 216, 235, 255]);
    }
  }

  for (const yRatio of [0.39, 0.49, 0.59]) {
    for (let y = large * yRatio; y < large * (yRatio + 0.035); y += 1) {
      for (let x = large * 0.31; x < large * 0.58; x += 1) {
        set(Math.floor(x), Math.floor(y), [45, 85, 120, 255]);
      }
    }
  }

  const arrow = [
    [large * 0.49, large * 0.62],
    [large * 0.69, large * 0.62],
    [large * 0.69, large * 0.52],
    [large * 0.86, large * 0.69],
    [large * 0.69, large * 0.86],
    [large * 0.69, large * 0.76],
    [large * 0.49, large * 0.76],
  ];
  for (let y = 0; y < large; y += 1) {
    for (let x = 0; x < large; x += 1) {
      if (insidePolygon(x, y, arrow)) set(x, y, [45, 211, 205, 255]);
    }
  }

  const downsampled = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const source = (((y * scale + sy) * large) + x * scale + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += pixels[source + channel];
          }
        }
      }
      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        downsampled[target + channel] = Math.round(totals[channel] / (scale * scale));
      }
    }
  }
  return encodePng(size, size, downsampled);
}

const output = path.join(root, 'public', 'icon');
await mkdir(output, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(output, `${size}.png`), render(size));
}
process.stdout.write('Generated original icons: 16, 32, 48, 128\n');
