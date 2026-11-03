import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/order/order-client.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Change left: -10000px to left: 0 and add z-index: -100
content = content.replace(
  /"left:-10000px",/,
  `"left:0",
        "opacity:0.01",`
);

// 2. Change scale: 3 to scale: 2 to avoid canvas size limitations on iOS
content = content.replace(
  /scale: 3,/,
  'scale: 2,'
);

fs.writeFileSync(filePath, content);
console.log('Successfully applied blank image fixes to order-client.tsx');
