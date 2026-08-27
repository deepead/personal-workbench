// 零依赖 Node 脚本：生成 PWA 应用图标 PNG
// 使用方式：node gen_pwa_icons.js <output-directory>
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = process.argv[2] || '.';

// ---------- 可自定义配置 ----------
const CONFIG = {
  // 主背景：左上角 -> 右下角渐变
  gradientFrom: [48, 185, 77],   // 薄荷绿 #30b94d
  gradientTo:   [31, 138, 112],  // 深青 #1f8a70
  starColor:  [255, 255, 255],   // 白色星星
  cornerRadius: 0.225,            // 圆角半径占边长比例
  starScale: 0.30,                // 主星大小
  smallStarScale: 0.32,           // 小星相对主星大小
  smallStarOffset: [0.24, -0.24]  // 小星相对中心偏移（占边长）
};

// ---------- PNG 编码器 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 几何 ----------
function lerp(a, b, t) { return a + (b - a) * t; }
function inRoundedRect(x, y, size, radius) {
  const cx = size / 2, cy = size / 2;
  const dx = Math.abs(x - cx) - (size / 2 - radius);
  const dy = Math.abs(y - cy) - (size / 2 - radius);
  const d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return d <= radius;
}
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function starPts(cx, cy, R) {
  const k = 0.22;
  return [
    [cx, cy - R], [cx + R * k, cy - R * k], [cx + R, cy], [cx + R * k, cy + R * k],
    [cx, cy + R], [cx - R * k, cy + R * k], [cx - R, cy], [cx - R * k, cy - R * k],
  ];
}

function makeIcon(size, starScale, fullBleed) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = 3; // 3x3 supersampling for AA
  const radius = fullBleed ? 0 : size * CONFIG.cornerRadius;
  const bigStar = starPts(size / 2, size / 2, size * starScale);
  const small = starScale * CONFIG.smallStarScale;
  const smallStar = starPts(size / 2 + size * CONFIG.smallStarOffset[0], size / 2 + size * CONFIG.smallStarOffset[1], size * small);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0, r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
          if (inRoundedRect(px, py, size, radius)) {
            const t = (px + py) / (2 * size);
            r += lerp(CONFIG.gradientFrom[0], CONFIG.gradientTo[0], t);
            g += lerp(CONFIG.gradientFrom[1], CONFIG.gradientTo[1], t);
            b += lerp(CONFIG.gradientFrom[2], CONFIG.gradientTo[2], t);
            hit++;
          }
        }
      }
      const idx = (y * size + x) * 4;
      if (hit === 0) { rgba[idx + 3] = 0; continue; }
      const n = hit;
      const white = pointInPoly(x + 0.5, y + 0.5, bigStar) || pointInPoly(x + 0.5, y + 0.5, smallStar);
      rgba[idx] = white ? CONFIG.starColor[0] : Math.round(r / n);
      rgba[idx + 1] = white ? CONFIG.starColor[1] : Math.round(g / n);
      rgba[idx + 2] = white ? CONFIG.starColor[2] : Math.round(b / n);
      rgba[idx + 3] = Math.round((hit / (S * S)) * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

fs.mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png', makeIcon(192, CONFIG.starScale, false)],
  ['icon-512.png', makeIcon(512, CONFIG.starScale, false)],
  ['icon-maskable-512.png', makeIcon(512, CONFIG.starScale * 0.8, true)],
  ['apple-touch-icon.png', makeIcon(180, CONFIG.starScale, false)],
];
for (const [name, buf] of files) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('saved:', name, buf.length, 'bytes');
}
