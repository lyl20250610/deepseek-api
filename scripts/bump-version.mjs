// scripts/bump-version.mjs — 一键升版：同步 package.json、Android 版本与 Service Worker 缓存版本
// 用法: pnpm version:bump 1.2.0          （正式升版：versionCode+1、CACHE_VERSION+1）
//       pnpm version:bump 1.1.0          （与当前一致时仅校验，不修改任何文件）
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const target = process.argv[2];
if (!target || !/^\d+\.\d+\.\d+$/.test(target)) {
  console.error('用法: pnpm version:bump <x.y.z>，例如 pnpm version:bump 1.2.0');
  process.exit(1);
}

const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const swPath = path.join(root, 'public', 'sw.js');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version === target) {
  console.log(`当前已是 ${target}，未做任何修改（校验通过）。`);
  process.exit(0);
}

// package.json
pkg.version = target;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// android/app/build.gradle: versionName + versionCode 递增
let gradle = fs.readFileSync(gradlePath, 'utf8');
const vcMatch = gradle.match(/^(\s*)versionCode (\d+)\s*$/m);
const vnMatch = gradle.match(/^(\s*)versionName "([^"]+)"\s*$/m);
if (!vcMatch || !vnMatch) {
  console.error('build.gradle 中未找到 versionCode/versionName，请手动检查。');
  process.exit(1);
}
const nextCode = Number(vcMatch[2]) + 1;
gradle = gradle.replace(/^( )*(versionCode) \d+$/m, `$1$2 ${nextCode}`);
gradle = gradle.replace(/^( )*(versionName) "[^"]+"$/m, `$1$2 "${target}"`);
fs.writeFileSync(gradlePath, gradle);

// public/sw.js: CACHE_VERSION 数字递增
let sw = fs.readFileSync(swPath, 'utf8');
const cacheMatch = sw.match(/CACHE_VERSION = '(ds-mobile-v(\d+))'/);
if (cacheMatch) {
  const nextCache = `ds-mobile-v${Number(cacheMatch[2]) + 1}`;
  sw = sw.replace(cacheMatch[1], nextCache);
  fs.writeFileSync(swPath, sw);
  console.log(`SW 缓存版本: ${cacheMatch[1]} -> ${nextCache}`);
} else {
  console.warn('警告: public/sw.js 未匹配 CACHE_VERSION，缓存版本未自动升级，请手动确认。');
}

console.log(`已升版: ${target} / versionCode ${nextCode}`);
console.log('下一步: pnpm android:apk  （或 PWA: pnpm build 后部署 dist/）');
