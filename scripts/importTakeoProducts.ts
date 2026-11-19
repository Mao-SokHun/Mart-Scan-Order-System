import { pool, initDb } from '../server/db';
import products from '../src/data/mockProducts.json';

async function importProducts() {
  console.log('🔗 Connecting to Neon PostgreSQL to import Takeo store products...');
  await initDb();

  const client = await pool.connect();
  try {
    let inserted = 0;
    let updated = 0;

    for (const p of products) {
      const res = await client.query(`
        INSERT INTO products (
          id, barcode, name, khmer_name, category, unit,
          cost_price, selling_price, current_stock, min_stock,
          supplier_name, image
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (barcode) DO UPDATE SET
          name = EXCLUDED.name,
          khmer_name = EXCLUDED.khmer_name,
          category = EXCLUDED.category,
          unit = EXCLUDED.unit,
          supplier_name = EXCLUDED.supplier_name,
          image = EXCLUDED.image
        RETURNING (xmax = 0) AS is_insert;
      `, [
        p.id,
        p.barcode,
        p.name,
        p.khmerName || null,
        p.category,
        p.unit,
        p.costPrice || 0,
        p.sellingPrice || 0,
        p.currentStock || 0,
        p.minStock || 10,
        p.supplierName,
        p.image
      ]);

      if (res.rows[0].is_insert) {
        inserted++;
      } else {
        updated++;
      }
    }

    const totalCountRes = await client.query('SELECT COUNT(*) FROM products;');
    console.log(`✅ Import finished! Inserted: ${inserted}, Updated: ${updated}`);
    console.log(`📊 Total products in Neon PostgreSQL: ${totalCountRes.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

importProducts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  });
