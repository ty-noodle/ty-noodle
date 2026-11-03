import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

function loadEnvFile(filename) {
  const filePath = resolve(rootDir, filename);
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) process.env[key] = rawValue;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function backfill() {
  console.log('Starting backfill...');
  
  // 1. Fetch all orders
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_date, created_at, organization_id, customer_id')
    .order('created_at', { ascending: true });
    
  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }
  
  console.log(`Found ${orders.length} orders.`);
  
  // 2. Group by month and organization
  const groups = {};
  for (const order of orders) {
    const yearMonth = order.order_date.substring(0, 7).replace('-', ''); // '202605'
    const key = `${order.organization_id}_${yearMonth}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(order);
  }
  
  // 3. Assign new numbers and update
  for (const key in groups) {
    const [orgId, yearMonth] = key.split('_');
    const monthOrders = groups[key];
    console.log(`Processing ${monthOrders.length} orders for ${key}`);
    
    let count = 0;
    for (const order of monthOrders) {
      count++;
      const newNumber = `DN${yearMonth}${String(count).padStart(4, '0')}`;
      
      console.log(`Updating order ${order.id} to ${newNumber}`);
      
      // Update order
      const { error: updateError } = await supabase
        .from('orders')
        .update({ order_number: newNumber })
        .eq('id', order.id);
        
      if (updateError) {
        console.error(`Error updating order ${order.id}:`, updateError);
      }
      
      // Update delivery note if exists
      const { data: dn } = await supabase
        .from('delivery_notes')
        .select('id')
        .eq('organization_id', orgId)
        .eq('customer_id', order.customer_id)
        .eq('delivery_date', order.order_date)
        .maybeSingle();
        
      if (dn) {
        console.log(`Updating DN ${dn.id} to ${newNumber}`);
        const { error: dnError } = await supabase
          .from('delivery_notes')
          .update({ delivery_number: newNumber })
          .eq('id', dn.id);
          
        if (dnError) {
          console.error(`Error updating DN ${dn.id}:`, dnError);
        }
      }
    }
  }
  
  console.log('Backfill completed!');
}

backfill();
