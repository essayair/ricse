import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('Standalone生产镜像同时复制页面、静态构建和public资源', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const runtime = dockerfile.split(' AS runtime')[1];
  assert(runtime, '必须检查运行时阶段，而非仅构建阶段');
  assert.match(runtime, /COPY[^\n]*\/\.next\/standalone\s+\.\//);
  assert.match(runtime, /COPY[^\n]*\/\.next\/static\s+\.\/apps\/web\/\.next\/static/);
  assert.match(runtime, /COPY[^\n]*\/apps\/web\/public\s+\.\/apps\/web\/public/);
});

test('全站入口配置统一的网站图标和缓存版本', () => {
  const entry = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
  assert(entry.includes('icons:') && entry.includes('apple:'));
  for (const path of ['/favicon.ico?v=20261118c', '/brand/favicon-32.png?v=20261118c', '/brand/favicon-192.png?v=20261118c', '/brand/apple-touch-icon.png?v=20261118c']) assert(entry.includes(path));
});
test('公开图标资源格式、透明度及多尺寸完整', () => {
  const ico = readFileSync(new URL('../public/favicon.ico', import.meta.url));
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  [16, 32, 48].forEach((size, index) => {
    const at = 6 + index * 16;
    assert.equal(ico[at], size); assert.equal(ico[at + 1], size);
    assert(ico.readUInt32LE(at + 12) + ico.readUInt32LE(at + 8) <= ico.length);
  });
  for (const [name, size] of [['favicon-32.png', 32], ['favicon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    const png = readFileSync(new URL('../public/brand/' + name, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6);
  }
});
