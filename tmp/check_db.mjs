import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://postgres.lcadzsnvxunmtkdhhrty:punchfolk2625@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
});

async function run() {
  await client.connect();

  // Query 1: Find delivery note items with cost_price = 0
  const res1 = await client.query(`
    SELECT 
      dni.id,
      dni.delivery_note_id,
      dn.delivery_date,
      dni.product_id,
      p.name as product_name,
      dni.product_sale_unit_id,
      dni.sale_unit_label,
      dni.quantity_delivered,
      dni.line_total,
      dni.cost_price
    FROM public.delivery_note_items dni
    JOIN public.products p ON p.id = dni.product_id
    JOIN public.delivery_notes dn ON dn.id = dni.delivery_note_id
    WHERE dni.cost_price = 0
    LIMIT 10;
  `);
  console.log("=== Items with cost_price = 0 ===");
  console.table(res1.rows);

  // Query 2: Let's call the RPC get_profit_sales_report and compare with manual sum
  const orgRes = await client.query(`SELECT id FROM public.organizations LIMIT 1;`);
  const orgId = orgRes.rows[0]?.id;
  
  if (orgId) {
    console.log(`Using organization ID: ${orgId}`);
    
    // Call get_profit_sales_report for last 30 days
    const rpcRes = await client.query(`
      SELECT * FROM public.get_profit_sales_report(
        $1::uuid, 
        (CURRENT_DATE - INTERVAL '30 days')::date, 
        CURRENT_DATE::date
      )
      WHERE sales > 0
      LIMIT 10;
    `);
    console.log("=== get_profit_sales_report (RPC) ===");
    console.table(rpcRes.rows);

    // Manual sum of delivery notes for the same date range
    const manualRes = await client.query(`
      WITH fn AS (
        SELECT id, delivery_date, total_amount
        FROM public.delivery_notes
        WHERE organization_id = $1::uuid
          AND status = 'confirmed'
          AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')::date
          AND delivery_date <= CURRENT_DATE::date
      ),
      nc AS (
        SELECT 
          dni.delivery_note_id,
          SUM(dni.quantity_delivered::numeric * dni.cost_price::numeric) as cost
        FROM public.delivery_note_items dni
        JOIN fn ON fn.id = dni.delivery_note_id
        GROUP BY dni.delivery_note_id
      )
      SELECT 
        fn.delivery_date,
        COUNT(*) as order_count,
        SUM(fn.total_amount) as sales,
        SUM(COALESCE(nc.cost, 0)) as cost,
        SUM(fn.total_amount) - SUM(COALESCE(nc.cost, 0)) as net_profit
      FROM fn
      LEFT JOIN nc ON nc.delivery_note_id = fn.id
      GROUP BY fn.delivery_date
      ORDER BY fn.delivery_date;
    `, [orgId]);
    console.log("=== Manual Calculation (Sum of dni.quantity_delivered * dni.cost_price) ===");
    console.table(manualRes.rows.filter(r => Number(r.sales) > 0).slice(0, 10));
  }

  await client.end();
}

run().catch(console.error);
