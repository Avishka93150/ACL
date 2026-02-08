/**
 * ACL GESTION - Icon Generator
 * Generates PNG icons from SVG for PWA and iOS
 *
 * Usage: node icons/generate-icons.js
 * Requires: npm install sharp (only for generation)
 */

const fs = require('fs');
const path = require('path');

// SVG icon template - Hotel building with ACL text
const generateSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1E3A5F"/>
      <stop offset="100%" style="stop-color:#2C5282"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <!-- Hotel building icon -->
  <g transform="translate(128, 80) scale(0.5)">
    <!-- Main building -->
    <rect x="96" y="120" width="320" height="380" rx="8" fill="rgba(255,255,255,0.95)"/>
    <!-- Roof -->
    <path d="M80 130 L256 30 L432 130 Z" fill="rgba(255,255,255,0.95)"/>
    <!-- Windows row 1 -->
    <rect x="140" y="170" width="50" height="50" rx="4" fill="#1E3A5F"/>
    <rect x="230" y="170" width="50" height="50" rx="4" fill="#1E3A5F"/>
    <rect x="320" y="170" width="50" height="50" rx="4" fill="#1E3A5F"/>
    <!-- Windows row 2 -->
    <rect x="140" y="260" width="50" height="50" rx="4" fill="#1E3A5F"/>
    <rect x="230" y="260" width="50" height="50" rx="4" fill="#1E3A5F"/>
    <rect x="320" y="260" width="50" height="50" rx="4" fill="#1E3A5F"/>
    <!-- Door -->
    <rect x="216" y="380" width="80" height="120" rx="6" fill="#1E3A5F"/>
    <circle cx="282" cy="445" r="6" fill="#D4AF37"/>
  </g>
  <!-- ACL Text -->
  <text x="256" y="460" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="72" fill="#FFFFFF" text-anchor="middle" letter-spacing="8">ACL</text>
</svg>`;

// Sizes needed for PWA + iOS
const sizes = [72, 96, 128, 144, 152, 192, 384, 512, 1024];

// iOS specific sizes
const iosSizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

const allSizes = [...new Set([...sizes, ...iosSizes])].sort((a, b) => a - b);

const iconsDir = path.join(__dirname);

// Try to use sharp if available, otherwise save SVGs
try {
  const sharp = require('sharp');

  async function generateAll() {
    for (const size of allSizes) {
      const svg = generateSVG(512); // Always render from 512 base
      const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);

      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`Generated: icon-${size}x${size}.png`);
    }
    console.log('\nAll icons generated successfully!');
  }

  generateAll().catch(console.error);
} catch (e) {
  // sharp not available, save SVG files instead
  console.log('sharp not installed. Saving SVG files...');
  console.log('To generate PNGs, run: npm install sharp && node icons/generate-icons.js\n');

  for (const size of allSizes) {
    const svg = generateSVG(size);
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.svg`);
    fs.writeFileSync(outputPath, svg.trim());
    console.log(`Saved: icon-${size}x${size}.svg`);
  }

  // Also save a master SVG
  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), generateSVG(512).trim());
  console.log('\nSVG icons saved. Convert to PNG using any tool or install sharp.');
}
