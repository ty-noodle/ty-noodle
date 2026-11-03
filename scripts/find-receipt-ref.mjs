import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/order/order-client.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('receiptCardRef')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
