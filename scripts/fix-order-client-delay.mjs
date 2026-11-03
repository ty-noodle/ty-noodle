import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/order/order-client.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove opacity: 0.01 or set to 1 to ensure it is not rendered as invisible
content = content.replace(
  /"opacity:0.01",/,
  '"opacity:1",'
);

// 2. Add a delay of 500ms before calling html2canvas to allow rendering
content = content.replace(
  /const canvas = await html2canvas/,
  `await new Promise((resolve) => setTimeout(resolve, 500));
      const canvas = await html2canvas`
);

fs.writeFileSync(filePath, content);
console.log('Successfully applied delay and opacity fixes to order-client.tsx');
