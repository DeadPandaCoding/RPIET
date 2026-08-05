/**
 * Regenerates public/valora-logo.png from the uploaded logo source.
 *
 * The upload is a PNG (1248x832, RGB, no alpha) that came named as a .jpg.
 * This script:
 *   1. Decodes the PNG (zlib inflate + unfilter scanlines)
 *   2. Chroma-keys out the solid background (sampled from the corners)
 *      with a feathering band so anti-aliased edges stay clean
 *   3. Downscales to a display-friendly width (bilinear, alpha-aware)
 *   4. Re-encodes as an RGBA PNG
 *
 * It emits TWO assets from the same keyed source:
 *   - public/valora-logo.png        — the original navy logo (light surfaces)
 *   - public/valora-logo-dark.png   — a warm-ivory silhouette (navy surfaces,
 *     so dark mode needs no white logo plate)
 *
 * Usage: node scripts/prepare-logo.mjs [path-to-source]
 * The source defaults to the original upload in the user's Downloads folder.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const TARGET_WIDTH = 320
const OUT = 'public/valora-logo.png'
const OUT_DARK = 'public/valora-logo-dark.png'
// Warm ivory that reads as a premium light mark on the navy canvas.
const DARK_IVORY = [0xf2, 0xef, 0xe8]
const DEFAULT_SRC = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '.',
  'Downloads',
  'logo_270997_1785970370.jpg',
)
const src = process.argv[2] ?? DEFAULT_SRC

// ---- Decode -----------------------------------------------------------------
const b = fs.readFileSync(src)
let off = 8, width = 0, height = 0, colorType = 0
const idat = []
while (off < b.length) {
  const len = b.readUInt32BE(off)
  const type = b.subarray(off + 4, off + 8).toString('ascii')
  if (type === 'IHDR') {
    width = b.readUInt32BE(off + 8)
    height = b.readUInt32BE(off + 12)
    colorType = b[off + 17]
  } else if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len))
  off += 12 + len
}
if (!width || !height) throw new Error('Could not parse PNG header from ' + src)
if (colorType !== 2 && colorType !== 6) throw new Error('Unsupported PNG color type: ' + colorType)
console.log('decoded', width + 'x' + height, 'colorType', colorType)

const raw = zlib.inflateSync(Buffer.concat(idat))
const bpp = colorType === 6 ? 4 : 3
const stride = width * bpp
const px = Buffer.alloc(height * stride)
for (let y = 0; y < height; y++) {
  const f = raw[y * (stride + 1)]
  const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
  const out = px.subarray(y * stride, (y + 1) * stride)
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? out[x - bpp] : 0
    const c = prev ? prev[x] : 0
    let v
    if (f === 0) v = row[x]
    else if (f === 1) v = (row[x] + a) & 0xff
    else if (f === 2) v = (row[x] + c) & 0xff
    else if (f === 3) v = (row[x] + ((a + c) >> 1)) & 0xff
    else {
      const bl = x >= bpp && prev ? prev[x - bpp] : 0
      const p = a + c - bl
      const pa = Math.abs(p - a), pb = Math.abs(p - c), pc = Math.abs(p - bl)
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? c : bl
      v = (row[x] + pred) & 0xff
    }
    out[x] = v
  }
}

// ---- Chroma-key -------------------------------------------------------------
const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [width >> 1, 0], [0, height >> 1]]
const counts = new Map()
for (const [cx, cy] of corners) {
  const i = cy * stride + cx * bpp
  const k = px[i] + ',' + px[i + 1] + ',' + px[i + 2]
  counts.set(k, (counts.get(k) || 0) + 1)
}
let bg = null, best = 0
for (const [k, v] of counts) if (v > best) { best = v; bg = k.split(',').map(Number) }
console.log('background:', bg.join(','))

const rgba = Buffer.alloc(height * width * 4)
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const si = y * stride + x * bpp, di = (y * width + x) * 4
    const r = px[si], g = px[si + 1], bl = px[si + 2]
    const d = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (bl - bg[2]) ** 2)
    let alpha = 255
    if (d <= 20) alpha = 0
    else if (d <= 70) alpha = Math.round(((d - 20) / 50) * 255)
    rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = bl; rgba[di + 3] = alpha
  }
}

// ---- Downscale (bilinear, alpha-aware) --------------------------------------
const th = Math.max(1, Math.round((height * TARGET_WIDTH) / width))
const down = Buffer.alloc(th * TARGET_WIDTH * 4)
const sx = width / TARGET_WIDTH
const sy = height / th
for (let y = 0; y < th; y++) {
  for (let x = 0; x < TARGET_WIDTH; x++) {
    const gx = (x + 0.5) * sx - 0.5
    const gy = (y + 0.5) * sy - 0.5
    const x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy))
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1)
    const fx = gx - x0, fy = gy - y0
    let r = 0, g = 0, bl = 0, a = 0
    for (const [yy, wy] of [[y0, 1 - fy], [y1, fy]]) {
      for (const [xx, wx] of [[x0, 1 - fx], [x1, fx]]) {
        const i = (yy * width + xx) * 4
        const aa = rgba[i + 3] / 255
        r += rgba[i] * aa * wx * wy
        g += rgba[i + 1] * aa * wx * wy
        bl += rgba[i + 2] * aa * wx * wy
        a += aa * wx * wy
      }
    }
    const di = (y * TARGET_WIDTH + x) * 4
    if (a > 0) {
      down[di] = Math.round(r / a)
      down[di + 1] = Math.round(g / a)
      down[di + 2] = Math.round(bl / a)
    }
    down[di + 3] = Math.round(a * 255)
  }
}

// ---- Dark variant (warm-ivory silhouette) ----------------------------------
const downDark = Buffer.from(down)
for (let i = 0; i < downDark.length; i += 4) {
  if (downDark[i + 3] > 0) {
    downDark[i] = DARK_IVORY[0]
    downDark[i + 1] = DARK_IVORY[1]
    downDark[i + 2] = DARK_IVORY[2]
  }
}

// ---- Encode -----------------------------------------------------------------
const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t })()
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const encodePng = (pixels, w, h) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const scan = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    scan[y * (w * 4 + 1)] = 0
    pixels.copy(scan, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const png = encodePng(down, TARGET_WIDTH, th)
const pngDark = encodePng(downDark, TARGET_WIDTH, th)
fs.writeFileSync(OUT, png)
fs.writeFileSync(OUT_DARK, pngDark)
console.log('wrote', OUT, TARGET_WIDTH + 'x' + th, (png.length / 1024).toFixed(1) + ' KB')
console.log('wrote', OUT_DARK, TARGET_WIDTH + 'x' + th, (pngDark.length / 1024).toFixed(1) + ' KB')
