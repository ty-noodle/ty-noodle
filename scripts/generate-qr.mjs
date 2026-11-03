import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QR_DATA = 'https://ty-noodle.vercel.app/menu';
const ESCAPED_DATA = encodeURIComponent(QR_DATA);

// API URLs (using qrserver.com which is free and reliable)
const PNG_URL = `https://api.qrserver.com/v1/create-qr-code/?size=2000x2000&data=${ESCAPED_DATA}&ecc=H`;
const SVG_URL = `https://api.qrserver.com/v1/create-qr-code/?size=2000x2000&data=${ESCAPED_DATA}&ecc=H&format=svg`;

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

async function downloadFile(url, destPath) {
  console.log(`Downloading QR code from: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch QR code: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  console.log(`Successfully saved to: ${destPath}`);
}

async function main() {
  try {
    // Ensure public folder exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Save PNG in root and public
    const rootPngPath = path.join(rootDir, 'menu_qr_code_2000.png');
    const publicPngPath = path.join(publicDir, 'menu_qr_code_2000.png');
    await downloadFile(PNG_URL, rootPngPath);
    fs.copyFileSync(rootPngPath, publicPngPath);

    // Save SVG in root and public
    const rootSvgPath = path.join(rootDir, 'menu_qr_code.svg');
    const publicSvgPath = path.join(publicDir, 'menu_qr_code.svg');
    await downloadFile(SVG_URL, rootSvgPath);
    fs.copyFileSync(rootSvgPath, publicSvgPath);

    console.log('\nAll QR codes generated successfully!');
  } catch (error) {
    console.error('Error generating QR codes:', error);
  }
}

main();
