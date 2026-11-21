import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true
});

// Prevent unhandled error event from crashing the server on Neon idle client disconnects
pool.on('error', (err) => {
  console.warn('⚠️ Unexpected error on idle PostgreSQL client (auto-recovering):', err.message);
});

let isDbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

const SEED_PRODUCTS = [
  {
    id: 'p-1',
    barcode: '8851959132014',
    name: 'Coca Cola Original Taste 330ml',
    khmer_name: 'កូកាកូឡា ៣៣០មល',
    category: 'ភេសជ្ជៈ (Beverages)',
    unit: 'កំប៉ុង',
    cost_price: 0.40,
    selling_price: 0.60,
    current_stock: 0,
    min_stock: 24,
    supplier_name: 'Cambodia Beverage Company (Coca-Cola)',
    supplier_phone: '023 428 888',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-2',
    barcode: '8841002010012',
    name: 'Angkor Beer Can 330ml',
    khmer_name: 'ស្រាបៀរអង្គរ កំប៉ុង ៣៣០មល',
    category: 'ស្រាបៀរ (Beer)',
    unit: 'កំប៉ុង',
    cost_price: 0.55,
    selling_price: 0.85,
    current_stock: 2,
    min_stock: 48,
    supplier_name: 'Cambrew Ltd (Angkor Beer)',
    supplier_phone: '023 990 001',
    image: 'https://images.unsplash.com/photo-1608270191599-28269e80bce4?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-3',
    barcode: '8845000100345',
    name: 'Vital Premium Water 500ml',
    khmer_name: 'ទឹកបរិសុទ្ធ វីតាល់ ៥០០មល',
    category: 'ទឹកបរិសុទ្ធ (Water)',
    unit: 'ដប',
    cost_price: 0.20,
    selling_price: 0.35,
    current_stock: 0,
    min_stock: 50,
    supplier_name: 'N.V.C Corporation (Vital)',
    supplier_phone: '023 880 880',
    image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-4',
    barcode: '8850124001234',
    name: 'Carabao Energy Drink 250ml',
    khmer_name: 'ភេសជ្ជៈប៉ូវកម្លាំង ការ៉ាបាវ',
    category: 'ភេសជ្ជៈ (Beverages)',
    unit: 'កំប៉ុង',
    cost_price: 0.42,
    selling_price: 0.65,
    current_stock: 1,
    min_stock: 30,
    supplier_name: 'Carabao Cambodia Distribution',
    supplier_phone: '012 345 678',
    image: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-5',
    barcode: '8850999001122',
    name: 'Mama Instant Noodles Shrimp Tom Yum',
    khmer_name: 'មីម៉ាម៉ា តុងយុាំបង្គា ៦០ក្រាម',
    category: 'មី និងអាហារក្រៀម (Instant Food)',
    unit: 'កញ្ចប់',
    cost_price: 0.25,
    selling_price: 0.40,
    current_stock: 0,
    min_stock: 60,
    supplier_name: 'DKSH (Cambodia) Ltd',
    supplier_phone: '023 212 838',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-6',
    barcode: '8851007011456',
    name: 'Ovaltine UHT Chocolate Malt 180ml',
    khmer_name: 'ទឹកដោះគោ អូវ៉ាន់ទីន ១៨០មល',
    category: 'ទឹកដោះគោ (Dairy)',
    unit: 'ប្រអប់',
    cost_price: 0.35,
    selling_price: 0.55,
    current_stock: 4,
    min_stock: 36,
    supplier_name: 'DKSH (Cambodia) Ltd',
    supplier_phone: '023 212 838',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-7',
    barcode: '8851111222334',
    name: 'Colgate Total 12 Toothpaste 150g',
    khmer_name: 'ថ្នាំដុសធ្មេញ កុលហ្គេត ១៥០ក្រាម',
    category: 'របស់របរប្រើប្រាស់ (Personal Care)',
    unit: 'ប្រអប់',
    cost_price: 1.20,
    selling_price: 1.80,
    current_stock: 0,
    min_stock: 12,
    supplier_name: 'Unilever / DKSH Cambodia',
    supplier_phone: '023 212 838',
    image: 'https://images.unsplash.com/photo-1559671089-a2e63cbfa311?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-8',
    barcode: '8852345678901',
    name: 'Pocky Chocolate Biscuit Sticks 47g',
    khmer_name: 'នំផុកគី សូកូឡា ៤៧ក្រាម',
    category: 'នំចំណី (Snacks)',
    unit: 'ប្រអប់',
    cost_price: 0.65,
    selling_price: 1.00,
    current_stock: 0,
    min_stock: 20,
    supplier_name: 'Thai Seng Trading Co., Ltd',
    supplier_phone: '023 881 234',
    image: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-9',
    barcode: '8858765432109',
    name: 'DAO 3-in-1 Instant Coffee Original (30 sticks)',
    khmer_name: 'កាហ្វេ ដាវ ៣ក្នុង១ កញ្ចប់ធំ',
    category: 'កាហ្វេ និងតែ (Coffee & Tea)',
    unit: 'កញ្ចប់',
    cost_price: 3.50,
    selling_price: 4.80,
    current_stock: 1,
    min_stock: 10,
    supplier_name: 'DAO Coffee Cambodia',
    supplier_phone: '092 888 999',
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'p-10',
    barcode: '8853456789012',
    name: 'Sunlight Lemon Dishwashing Liquid 750ml',
    khmer_name: 'ទឹកលាងចាន សាន់ឡាយ ក្រូចឆ្មា ៧៥០មល',
    category: 'សម្ភារៈបន្ទប់ទឹក/ផ្ទះបាយ (Household)',
    unit: 'ដប',
    cost_price: 1.10,
    selling_price: 1.65,
    current_stock: 0,
    min_stock: 15,
    supplier_name: 'Unilever Cambodia',
    supplier_phone: '023 218 555',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=300&auto=format&fit=crop&q=80'
  }
];

export const initDb = async () => {
  if (isDbInitialized) return;
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL is not set. Database initialization skipped.');
    return;
  }
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    let client;
    try {
      client = await pool.connect();

      // 1. Create products table
      await client.query(`
        CREATE TABLE IF NOT EXISTS products (
          id VARCHAR(64) PRIMARY KEY,
          barcode VARCHAR(128) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          khmer_name VARCHAR(255),
          category VARCHAR(128),
          unit VARCHAR(64) DEFAULT 'កំប៉ុង',
          cost_price NUMERIC(10, 2) DEFAULT 0.00,
          selling_price NUMERIC(10, 2) DEFAULT 0.00,
          current_stock INTEGER DEFAULT 0,
          min_stock INTEGER DEFAULT 10,
          supplier_name VARCHAR(255),
          supplier_phone VARCHAR(64),
          image TEXT,
          remark TEXT,
          storage_temp VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure new columns exist on older existing products tables
      await client.query(`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS remark TEXT;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS storage_temp VARCHAR(64);
      `);

      // 2. Create restock_items table
      await client.query(`
        CREATE TABLE IF NOT EXISTS restock_items (
          id VARCHAR(64) PRIMARY KEY,
          product_id VARCHAR(64) UNIQUE REFERENCES products(id) ON DELETE CASCADE,
          barcode VARCHAR(128) NOT NULL,
          order_quantity INTEGER NOT NULL DEFAULT 0,
          unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(32) DEFAULT 'pending',
          note TEXT
        );
      `);

      // Deduplicate restock_items if any duplicate product_id rows exist from older versions
      await client.query(`
        DELETE FROM restock_items a USING restock_items b
        WHERE a.ctid < b.ctid AND a.product_id = b.product_id;
      `);

      // Ensure UNIQUE constraint index exists on product_id
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_restock_items_product_id ON restock_items (product_id);
      `);

      // 3. Create purchase_orders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id VARCHAR(64) PRIMARY KEY,
          po_number VARCHAR(64) UNIQUE NOT NULL,
          supplier_name VARCHAR(255),
          total_amount NUMERIC(10, 2) DEFAULT 0.00,
          status VARCHAR(32) DEFAULT 'draft',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Create app_settings table (stores telegram_chat_id, preferences, etc.)
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key VARCHAR(64) PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Seed initial products if table is completely empty
      const countRes = await client.query('SELECT COUNT(*) FROM products;');
      const count = parseInt(countRes.rows[0].count, 10);
      if (count === 0) {
        console.log('🌱 Seeding initial sample products to Neon PostgreSQL...');
        for (const p of SEED_PRODUCTS) {
          await client.query(`
            INSERT INTO products (
              id, barcode, name, khmer_name, category, unit,
              cost_price, selling_price, current_stock, min_stock,
              supplier_name, supplier_phone, image
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (barcode) DO NOTHING;
          `, [
            p.id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
            p.cost_price, p.selling_price, p.current_stock, p.min_stock,
            p.supplier_name, p.supplier_phone, p.image
          ]);
        }
        console.log('✅ Seeded 10 initial products successfully!');
      }

      isDbInitialized = true;
    } catch (err) {
      console.error('Database initialization error:', err);
    } finally {
      if (client) client.release();
      dbInitPromise = null;
    }
  })();

  return dbInitPromise;
};

export const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper to safely parse floating point numbers
const safeFloat = (val: any, fallback = 0): number => {
  if (val === null || val === undefined) return fallback;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
};

// Helper to safely parse integers
const safeInt = (val: any, fallback = 0): number => {
  if (val === null || val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
};

// Helper to safely round numeric totals to 2 decimal places
const roundMoney = (val: number): number => {
  return Math.round(val * 100) / 100;
};

// Helper to map DB snake_case product row to frontend Product type
const mapProduct = (row: any) => ({
  id: String(row.product_id || row.id || ''),
  barcode: String(row.barcode || ''),
  name: String(row.name || ''),
  khmerName: row.khmer_name || undefined,
  category: row.category || 'ផ្សេងៗ (Other)',
  unit: row.unit || 'កំប៉ុង',
  costPrice: safeFloat(row.cost_price, 0),
  sellingPrice: safeFloat(row.selling_price, 0),
  currentStock: safeInt(row.current_stock, 0),
  minStock: safeInt(row.min_stock, 10),
  supplierName: row.supplier_name || 'ទូទៅ (General Supplier)',
  supplierPhone: row.supplier_phone || undefined,
  remark: row.remark || undefined,
  storageTemp: row.storage_temp || undefined,
  image: row.image || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// Helper to map DB row to RestockItem
const mapRestockItem = (row: any) => ({
  id: String(row.id || ''),
  product: mapProduct(row),
  orderQuantity: safeInt(row.order_quantity, 0),
  scannedAt: row.scanned_at || new Date().toISOString(),
  unitCost: safeFloat(row.unit_cost, 0),
  totalCost: roundMoney(safeFloat(row.total_cost, 0)),
  status: row.status || 'pending',
  note: row.note || undefined
});

// Middleware to ensure DB is initialized
app.use(async (_req, _res, next) => {
  if (!isDbInitialized) {
    try {
      await initDb();
    } catch (e) {
      console.error('Init DB error in middleware:', e);
    }
  }
  next();
});

// 1. Health check & DB status
app.get('/api/health', async (_req: Request, res: Response) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      status: 'error',
      message: 'DATABASE_URL is not configured'
    });
  }
  try {
    const result = await pool.query('SELECT NOW() as now, current_database() as db;');
    res.json({
      status: 'ok',
      database: result.rows[0].db,
      neonTime: result.rows[0].now,
      provider: 'Neon PostgreSQL'
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. GET all products (with optional search query: ?search=... or ?q=..., limit, offset)
app.get('/api/products', async (req: Request, res: Response) => {
  try {
    const search = req.query.search || req.query.q;
    const hasLimit = req.query.limit !== undefined;
    const limit = hasLimit ? Math.min(5000, Math.max(1, safeInt(req.query.limit, 1000))) : 5000;
    const offset = Math.max(0, safeInt(req.query.offset, 0));

    let result;
    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      result = await pool.query(`
        SELECT * FROM products 
        WHERE LOWER(barcode) LIKE $1 
           OR LOWER(name) LIKE $1 
           OR LOWER(COALESCE(khmer_name, '')) LIKE $1
           OR LOWER(COALESCE(category, '')) LIKE $1
           OR LOWER(COALESCE(supplier_name, '')) LIKE $1
        ORDER BY name ASC
        LIMIT $2 OFFSET $3;
      `, [q, limit, offset]);
    } else {
      result = await pool.query('SELECT * FROM products ORDER BY name ASC LIMIT $1 OFFSET $2;', [limit, offset]);
    }
    res.json(result.rows.map(mapProduct));
  } catch (err: any) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. GET product by barcode
app.get('/api/products/barcode/:barcode', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;
    let cleanBarcode = String(barcode || '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);
    if (!cleanBarcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
    const result = await pool.query('SELECT * FROM products WHERE LOWER(TRIM(barcode)) = LOWER($1) LIMIT 1;', [cleanBarcode]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', barcode: cleanBarcode });
    }
    res.json(mapProduct(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST create new product
app.post('/api/products', async (req: Request, res: Response) => {
  try {
    const {
      barcode, name, khmerName, category, unit,
      costPrice, sellingPrice, currentStock, minStock,
      supplierName, supplierPhone, image, remark, storageTemp
    } = req.body || {};

    let cleanBarcode = String(barcode || '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);
    const cleanName = String(name || '').trim();

    if (!cleanBarcode || !cleanName) {
      return res.status(400).json({ error: 'Barcode and Name are required and cannot be empty' });
    }

    // Check if barcode already exists (case-insensitive)
    const existing = await pool.query('SELECT * FROM products WHERE LOWER(TRIM(barcode)) = LOWER($1) LIMIT 1;', [cleanBarcode]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        error: `Barcode "${cleanBarcode}" មានរួចហើយក្នុងប្រព័ន្ធ! (ឈ្មោះ: ${existing.rows[0].name})`,
        product: mapProduct(existing.rows[0])
      });
    }

    const id = `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const result = await pool.query(`
      INSERT INTO products (
        id, barcode, name, khmer_name, category, unit,
        cost_price, selling_price, current_stock, min_stock,
        supplier_name, supplier_phone, image, remark, storage_temp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `, [
      id, cleanBarcode, cleanName, khmerName ? String(khmerName).trim() : null,
      category ? String(category).trim() : 'ផ្សេងៗ (Other)', unit ? String(unit).trim() : 'កំប៉ុង',
      roundMoney(Math.max(0, safeFloat(costPrice, 0))), roundMoney(Math.max(0, safeFloat(sellingPrice, 0))),
      Math.max(0, safeInt(currentStock, 0)), Math.max(0, safeInt(minStock, 10)),
      supplierName ? String(supplierName).trim() : 'ទូទៅ (General Supplier)', supplierPhone ? String(supplierPhone).trim() : null,
      image || null, remark ? String(remark).trim() : null, storageTemp ? String(storageTemp).trim() : null
    ]);

    res.status(201).json(mapProduct(result.rows[0]));
  } catch (err: any) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. PUT update existing product
app.put('/api/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, khmerName, category, unit,
      costPrice, sellingPrice, currentStock, minStock,
      supplierName, supplierPhone, image, remark, storageTemp
    } = req.body || {};

    const existing = await pool.query(
      'SELECT * FROM products WHERE id = $1 OR LOWER(TRIM(barcode)) = LOWER(TRIM($1)) LIMIT 1;',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const targetId = existing.rows[0].id;

    const result = await pool.query(`
      UPDATE products
      SET name = COALESCE($1, name),
          khmer_name = COALESCE($2, khmer_name),
          category = COALESCE($3, category),
          unit = COALESCE($4, unit),
          cost_price = COALESCE($5, cost_price),
          selling_price = COALESCE($6, selling_price),
          current_stock = COALESCE($7, current_stock),
          min_stock = COALESCE($8, min_stock),
          supplier_name = COALESCE($9, supplier_name),
          supplier_phone = COALESCE($10, supplier_phone),
          image = COALESCE($11, image),
          remark = COALESCE($12, remark),
          storage_temp = COALESCE($13, storage_temp),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
      RETURNING *;
    `, [
      name ? String(name).trim() : null,
      khmerName !== undefined ? (khmerName ? String(khmerName).trim() : null) : null,
      category ? String(category).trim() : null,
      unit ? String(unit).trim() : null,
      costPrice !== undefined ? Math.max(0, safeFloat(costPrice, 0)) : null,
      sellingPrice !== undefined ? Math.max(0, safeFloat(sellingPrice, 0)) : null,
      currentStock !== undefined ? Math.max(0, safeInt(currentStock, 0)) : null,
      minStock !== undefined ? Math.max(0, safeInt(minStock, 10)) : null,
      supplierName ? String(supplierName).trim() : null,
      supplierPhone !== undefined ? (supplierPhone ? String(supplierPhone).trim() : null) : null,
      image !== undefined ? (image || null) : null,
      remark !== undefined ? (remark ? String(remark).trim() : null) : null,
      storageTemp !== undefined ? (storageTemp ? String(storageTemp).trim() : null) : null,
      targetId
    ]);

    res.json(mapProduct(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. DELETE product from catalog
app.delete('/api/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 OR LOWER(TRIM(barcode)) = LOWER(TRIM($1)) RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true, deletedId: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/products/batch - Bulk catalog import
app.post('/api/products/batch', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { products: items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Array of products is required' });
    }

    await client.query('BEGIN');
    let insertedCount = 0;
    for (const p of items) {
      if (!p) continue;
      let cleanBarcode = String(p.barcode || '').trim();
      if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);
      let cleanName = String(p.name || '').trim();
      if (!cleanBarcode || !cleanName) continue;

      // Check for existing product by case-insensitive barcode to ensure exact conflict target
      const existing = await client.query(
        'SELECT id, barcode FROM products WHERE LOWER(TRIM(barcode)) = LOWER($1) LIMIT 1;',
        [cleanBarcode]
      );
      const targetBarcode = existing.rows.length > 0 ? existing.rows[0].barcode : cleanBarcode;
      const id = existing.rows.length > 0 ? existing.rows[0].id : (p.id || `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

      await client.query(`
        INSERT INTO products (
          id, barcode, name, khmer_name, category, unit,
          cost_price, selling_price, current_stock, min_stock,
          supplier_name, supplier_phone, image, remark, storage_temp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (barcode) DO UPDATE SET
          name = EXCLUDED.name,
          khmer_name = COALESCE(EXCLUDED.khmer_name, products.khmer_name),
          category = COALESCE(EXCLUDED.category, products.category),
          unit = COALESCE(EXCLUDED.unit, products.unit),
          cost_price = EXCLUDED.cost_price,
          selling_price = EXCLUDED.selling_price,
          current_stock = EXCLUDED.current_stock,
          min_stock = EXCLUDED.min_stock,
          supplier_name = COALESCE(EXCLUDED.supplier_name, products.supplier_name),
          remark = COALESCE(EXCLUDED.remark, products.remark),
          storage_temp = COALESCE(EXCLUDED.storage_temp, products.storage_temp),
          updated_at = CURRENT_TIMESTAMP;
      `, [
        id, targetBarcode, String(p.name).trim(), p.khmerName ? String(p.khmerName).trim() : null,
        p.category ? String(p.category).trim() : 'ផ្សេងៗ (Other)', p.unit ? String(p.unit).trim() : 'កំប៉ុង',
        Math.max(0, safeFloat(p.costPrice, 0)), Math.max(0, safeFloat(p.sellingPrice, 0)),
        Math.max(0, safeInt(p.currentStock, 0)), Math.max(0, safeInt(p.minStock, 10)),
        p.supplierName ? String(p.supplierName).trim() : 'ទូទៅ (General Supplier)', p.supplierPhone ? String(p.supplierPhone).trim() : null,
        p.image || null, p.remark ? String(p.remark).trim() : null, p.storageTemp ? String(p.storageTemp).trim() : null
      ]);
      insertedCount++;
    }
    await client.query('COMMIT');
    res.json({ success: true, count: insertedCount });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 8. GET current restock items
app.get('/api/restock', async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
        p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
        p.cost_price, p.selling_price, p.current_stock, p.min_stock,
        p.supplier_name, p.supplier_phone, p.remark, p.storage_temp, p.image, p.created_at, p.updated_at
      FROM restock_items r
      JOIN products p ON r.product_id = p.id
      ORDER BY r.scanned_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows.map(mapRestockItem));
  } catch (err: any) {
    console.error('Error fetching restock items:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. POST /api/restock/scan - CORE SCAN ENDPOINT (Race-condition safe with ON CONFLICT)
app.post('/api/restock/scan', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.body || {};
    let cleanBarcode = String(barcode || '').trim();
    if (cleanBarcode.endsWith('.0')) cleanBarcode = cleanBarcode.slice(0, -2);
    if (!cleanBarcode) {
      return res.status(400).json({ error: 'Barcode is required and cannot be empty' });
    }

    // 1. Find product (case-insensitive for barcode matching)
    const prodRes = await pool.query('SELECT * FROM products WHERE LOWER(TRIM(barcode)) = LOWER($1) LIMIT 1;', [cleanBarcode]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ found: false, barcode: cleanBarcode, message: 'Barcode not found in catalog' });
    }

    const prod = prodRes.rows[0];
    const costPrice = safeFloat(prod.cost_price, 0);

    // 2. Check if already in restock_items
    const existingRes = await pool.query(
      'SELECT id FROM restock_items WHERE product_id = $1 OR LOWER(TRIM(barcode)) = LOWER($2) LIMIT 1;',
      [prod.id, cleanBarcode]
    );

    if (existingRes.rows.length > 0) {
      // ITEM ALREADY EXISTS: Do NOT auto-increment (+1) to avoid accidental duplicate orders!
      const existing = existingRes.rows[0];
      const itemRes = await pool.query(`
        SELECT 
          r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
          p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
          p.cost_price, p.selling_price, p.current_stock, p.min_stock,
          p.supplier_name, p.supplier_phone, p.remark, p.storage_temp, p.image, p.created_at, p.updated_at
        FROM restock_items r
        JOIN products p ON r.product_id = p.id
        WHERE r.id = $1;
      `, [existing.id]);

      return res.json({
        found: true,
        action: 'already_exists',
        message: 'ទំនិញនេះមានក្នុងតារាងរួចហើយ (មិនបូកស្ទួនចំនួនទេ)',
        item: mapRestockItem(itemRes.rows[0])
      });
    }

    // Insert new item with collision-proof unique ID and ON CONFLICT (product_id) DO NOTHING
    const newId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const defaultQty = 0;
    const totalCost = 0;

    const insertRes = await pool.query(`
      INSERT INTO restock_items (
        id, product_id, barcode, order_quantity, unit_cost, total_cost, scanned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id) DO NOTHING
      RETURNING id;
    `, [newId, prod.id, prod.barcode, defaultQty, costPrice, totalCost]);

    const finalId = insertRes.rows.length > 0 ? insertRes.rows[0].id : (
      (await pool.query('SELECT id FROM restock_items WHERE product_id = $1;', [prod.id])).rows[0].id
    );

    const isNewlyAdded = insertRes.rows.length > 0;

    const itemRes = await pool.query(`
      SELECT 
        r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
        p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
        p.cost_price, p.selling_price, p.current_stock, p.min_stock,
        p.supplier_name, p.supplier_phone, p.remark, p.storage_temp, p.image, p.created_at, p.updated_at
      FROM restock_items r
      JOIN products p ON r.product_id = p.id
      WHERE r.id = $1;
    `, [finalId]);

    return res.json({
      found: true,
      action: isNewlyAdded ? 'added' : 'already_exists',
      message: isNewlyAdded ? 'បានបញ្ចូលក្នុងតារាង! រង់ចាំ Admin វាយចំនួន' : 'ទំនិញនេះមានក្នុងតារាងរួចហើយ (មិនបូកស្ទួនចំនួនទេ)',
      item: mapRestockItem(itemRes.rows[0])
    });
  } catch (err: any) {
    console.error('Error during scan:', err);
    res.status(500).json({ error: err.message });
  }
});

// 10. PUT update quantity and note of restock item (supports update by item ID, product ID, or barcode with auto-upsert)
app.put('/api/restock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orderQuantity, note, status, productId, barcode } = req.body || {};
    const qty = Math.max(0, safeInt(orderQuantity, 0));

    // Check if restock item exists by ID, product_id, or barcode
    const check = await pool.query(
      `SELECT id, product_id, unit_cost FROM restock_items 
       WHERE id = $1 
          OR product_id = $1 
          OR ($2::text IS NOT NULL AND product_id = $2)
          OR ($3::text IS NOT NULL AND LOWER(TRIM(barcode)) = LOWER(TRIM($3)))
       LIMIT 1;`,
      [id, productId ? String(productId).trim() : null, barcode ? String(barcode).trim() : null]
    );

    if (check.rows.length === 0) {
      // If item was added offline, check products table to auto-upsert
      const prodCheck = await pool.query(
        `SELECT * FROM products 
         WHERE id = $1 
            OR LOWER(TRIM(barcode)) = LOWER(TRIM($1))
            OR ($2::text IS NOT NULL AND id = $2)
            OR ($3::text IS NOT NULL AND LOWER(TRIM(barcode)) = LOWER(TRIM($3)))
         LIMIT 1;`,
        [id, productId ? String(productId).trim() : null, barcode ? String(barcode).trim() : null]
      );
      if (prodCheck.rows.length > 0) {
        const prod = prodCheck.rows[0];
        const unitCost = safeFloat(prod.cost_price, 0);
        const totalCost = roundMoney(qty * unitCost);
        const newId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await pool.query(`
          INSERT INTO restock_items (id, product_id, barcode, order_quantity, unit_cost, total_cost, scanned_at, note, status)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)
          ON CONFLICT (product_id) DO UPDATE SET
            order_quantity = EXCLUDED.order_quantity,
            total_cost = EXCLUDED.total_cost,
            note = COALESCE(EXCLUDED.note, restock_items.note),
            status = COALESCE(EXCLUDED.status, restock_items.status);
        `, [newId, prod.id, prod.barcode, qty, unitCost, totalCost, note || null, status || 'pending']);
        return res.json({ success: true, id: newId, orderQuantity: qty, totalCost, note, status });
      }
      return res.status(404).json({ error: 'Item not found' });
    }

    const row = check.rows[0];
    const unitCost = safeFloat(row.unit_cost, 0);
    const totalCost = roundMoney(qty * unitCost);

    await pool.query(`
      UPDATE restock_items
      SET order_quantity = $1, total_cost = $2,
          note = COALESCE($4, note),
          status = COALESCE($5, status)
      WHERE id = $3;
    `, [qty, totalCost, row.id, note !== undefined ? note : null, status !== undefined ? status : null]);

    res.json({ success: true, id: row.id, orderQuantity: qty, totalCost, note, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. POST /api/restock/batch - Sync batch restock items (used for offline synchronization)
app.post('/api/restock/batch', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Array of restock items is required' });
    }

    await client.query('BEGIN');
    let syncedCount = 0;
    for (const item of items) {
      const barcode = item.product?.barcode || item.barcode;
      if (!barcode) continue;
      const cleanBarcode = String(barcode).trim();

      const pRes = await client.query('SELECT * FROM products WHERE LOWER(TRIM(barcode)) = LOWER($1) LIMIT 1;', [cleanBarcode]);
      if (pRes.rows.length === 0) continue;
      const prod = pRes.rows[0];

      const qty = Math.max(0, safeInt(item.orderQuantity, 0));
      const unitCost = safeFloat(prod.cost_price, 0);
      const totalCost = roundMoney(qty * unitCost);
      const id = item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      await client.query(`
        INSERT INTO restock_items (
          id, product_id, barcode, order_quantity, unit_cost, total_cost, scanned_at, note, status
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)
        ON CONFLICT (product_id) DO UPDATE SET
          order_quantity = CASE 
            WHEN EXCLUDED.order_quantity > 0 THEN EXCLUDED.order_quantity 
            ELSE restock_items.order_quantity 
          END,
          total_cost = ROUND(
            (CASE 
              WHEN EXCLUDED.order_quantity > 0 THEN EXCLUDED.order_quantity 
              ELSE restock_items.order_quantity 
            END) * EXCLUDED.unit_cost, 
            2
          ),
          note = COALESCE(EXCLUDED.note, restock_items.note),
          status = COALESCE(EXCLUDED.status, restock_items.status);
      `, [id, prod.id, prod.barcode, qty, unitCost, totalCost, item.note || null, item.status || 'pending']);
      syncedCount++;
    }
    await client.query('COMMIT');

    const allRes = await client.query(`
      SELECT 
        r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
        p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
        p.cost_price, p.selling_price, p.current_stock, p.min_stock,
        p.supplier_name, p.supplier_phone, p.remark, p.storage_temp, p.image, p.created_at, p.updated_at
      FROM restock_items r
      JOIN products p ON r.product_id = p.id
      ORDER BY r.scanned_at DESC;
    `);

    res.json({ success: true, count: syncedCount, items: allRes.rows.map(mapRestockItem) });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 12. DELETE single item from restock list (supports deletion by item ID, product ID, or barcode)
app.delete('/api/restock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const productId = req.query.productId ? String(req.query.productId).trim() : null;
    const barcode = req.query.barcode ? String(req.query.barcode).trim() : null;

    await pool.query(
      `DELETE FROM restock_items 
       WHERE id = $1 
          OR product_id = $1 
          OR LOWER(TRIM(barcode)) = LOWER(TRIM($1))
          OR ($2::text IS NOT NULL AND product_id = $2)
          OR ($3::text IS NOT NULL AND LOWER(TRIM(barcode)) = LOWER(TRIM($3)));`,
      [id, productId, barcode]
    );
    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. DELETE clear all restock items
app.delete('/api/restock', async (_req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM restock_items;');
    res.json({ success: true, message: 'All restock items cleared' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TELEGRAM BOT INTEGRATION API
// Bot: @Digital_Invitation_Link_bot (https://t.me/Digital_Invitation_Link_bot)
// ==========================================
const DEFAULT_TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9202062895:AAE46SFy11XxMWa9tbmJL-nlmWLuxlp39Yg';

// Helper to chunk long text into Telegram-compliant pieces (<4000 characters)
const splitTelegramText = (text: string, maxLen = 3900): string[] => {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > maxLen) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n' + line : line;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
};

// Helper to strip HTML tags for plain-text fallback
const stripHtml = (html: string): string => {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
};

// 14. GET Telegram Bot info & health check
app.get('/api/telegram/info', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || DEFAULT_TELEGRAM_BOT_TOKEN;
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data: any = await tgRes.json();
    if (!data.ok) {
      return res.status(400).json({ ok: false, error: data.description || 'Invalid Telegram bot token' });
    }
    res.json({
      ok: true,
      bot: data.result,
      botUsername: data.result?.username || 'Digital_Invitation_Link_bot',
      botLink: `https://t.me/${data.result?.username || 'Digital_Invitation_Link_bot'}`
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 15. GET Telegram recent updates (Auto-detect user or group chat IDs)
app.get('/api/telegram/updates', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || DEFAULT_TELEGRAM_BOT_TOKEN;
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&offset=-100`);
    const data: any = await tgRes.json();

    if (!data.ok) {
      return res.status(400).json({ ok: false, error: data.description || 'Failed to fetch Telegram updates' });
    }

    const chatsMap = new Map<string, any>();
    const updates = Array.isArray(data.result) ? data.result : [];

    for (const update of updates) {
      const msg = update.message || update.channel_post || update.edited_message || update.my_chat_member;
      const chat = msg?.chat;
      if (!chat || !chat.id) continue;

      const from = msg?.from;
      const chatIdStr = String(chat.id);
      const isGroup = chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel';

      const displayName = isGroup
        ? (chat.title || 'ក្រុម (Group)')
        : (`${from?.first_name || chat.first_name || ''} ${from?.last_name || chat.last_name || ''}`.trim() || chat.username || `User ${chat.id}`);

      const msgDate = msg?.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString();

      if (!chatsMap.has(chatIdStr) || new Date(msgDate) > new Date(chatsMap.get(chatIdStr).lastActive)) {
        chatsMap.set(chatIdStr, {
          id: chatIdStr,
          type: chat.type,
          name: displayName,
          username: chat.username || from?.username || '',
          lastActive: msgDate,
          lastText: msg?.text || (msg?.document ? '📎 Document' : msg?.photo ? '📷 Photo' : 'Joined/Started')
        });
      }
    }

    const chats = Array.from(chatsMap.values()).sort(
      (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
    );

    res.json({
      ok: true,
      botUsername: 'Digital_Invitation_Link_bot',
      botLink: 'https://t.me/Digital_Invitation_Link_bot',
      chatsCount: chats.length,
      chats
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 16. GET / POST Telegram Saved Chat Settings
app.get('/api/telegram/settings', async (_req: Request, res: Response) => {
  try {
    const row = await pool.query("SELECT value FROM app_settings WHERE key = 'telegram_chat_id' LIMIT 1;");
    const chatId = row.rows.length > 0 ? row.rows[0].value : null;
    res.json({
      chatId,
      botUsername: 'Digital_Invitation_Link_bot',
      botLink: 'https://t.me/Digital_Invitation_Link_bot'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/settings', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body || {};
    if (chatId) {
      await pool.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('telegram_chat_id', $1, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `, [String(chatId).trim()]);
    }
    res.json({ success: true, chatId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. POST Send Excel Document & Order Text to Telegram
app.post('/api/telegram/send', async (req: Request, res: Response) => {
  try {
    const {
      chatId,
      messageText,
      excelBase64,
      fileName,
      caption,
      botToken: customToken
    } = req.body || {};

    const token = customToken || DEFAULT_TELEGRAM_BOT_TOKEN;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'Chat ID ត្រូវបានទាមទារ! សូមបញ្ចូល Telegram Chat ID ឬ Group ID។'
      });
    }

    const cleanChatId = String(chatId).trim();
    let documentSent = false;
    let messageSent = false;
    let lastTelegramError: string | null = null;

    // A. Send Excel Document (.xlsx) if provided
    if (excelBase64) {
      try {
        const rawBase64 = excelBase64.includes(',') ? excelBase64.split(',')[1] : excelBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const formData = new FormData();
        formData.append('chat_id', cleanChatId);
        formData.append('document', blob, fileName || 'Takeo_Daily_Order_Plan.xlsx');

        if (caption) {
          formData.append('caption', caption.slice(0, 1024));
          formData.append('parse_mode', 'HTML');
        }

        const docRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
          method: 'POST',
          body: formData
        });
        const docData: any = await docRes.json();

        if (docData.ok) {
          documentSent = true;
        } else {
          lastTelegramError = docData.description || 'បរាជ័យក្នុងការផ្ញើឯកសារ Excel';
          console.error('Telegram sendDocument error:', docData);

          // Retry without HTML parse_mode if entity parsing failed
          if (caption && docData.description?.includes("can't parse entities")) {
            const retryFormData = new FormData();
            retryFormData.append('chat_id', cleanChatId);
            retryFormData.append('document', blob, fileName || 'Takeo_Daily_Order_Plan.xlsx');
            retryFormData.append('caption', stripHtml(caption).slice(0, 1024));

            const retryRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
              method: 'POST',
              body: retryFormData
            });
            const retryData: any = await retryRes.json();
            if (retryData.ok) {
              documentSent = true;
              lastTelegramError = null;
            }
          }
        }
      } catch (docErr: any) {
        console.error('Exception during document send:', docErr);
        lastTelegramError = docErr.message;
      }
    }

    // B. Send Text Message if provided
    if (messageText && messageText.trim()) {
      try {
        const chunks = splitTelegramText(messageText, 3900);
        let allChunksSent = true;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}] ` : '';
          const textToSend = prefix + chunk;

          let msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cleanChatId,
              text: textToSend,
              parse_mode: 'HTML'
            })
          });
          let msgData: any = await msgRes.json();

          // Fallback to plain text if HTML parsing failed
          if (!msgData.ok && msgData.description?.includes("can't parse entities")) {
            msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: cleanChatId,
                text: prefix + stripHtml(chunk)
              })
            });
            msgData = await msgRes.json();
          }

          if (!msgData.ok) {
            allChunksSent = false;
            lastTelegramError = msgData.description || 'បរាជ័យក្នុងការផ្ញើសារអត្ថបទ';
            console.error('Telegram sendMessage error:', msgData);
            break;
          }
        }

        if (allChunksSent) {
          messageSent = true;
        }
      } catch (msgErr: any) {
        console.error('Exception during text send:', msgErr);
        lastTelegramError = msgErr.message;
      }
    }

    // If both failed and we have an error
    if (!documentSent && !messageSent && lastTelegramError) {
      let friendlyError = lastTelegramError;
      if (lastTelegramError.includes('chat not found')) {
        friendlyError = 'រកមិនឃើញ Chat ID នេះទេ! សូមប្រាកដថាអ្នកបានចុច Start លើ Bot @Digital_Invitation_Link_bot ឬ Add Bot ចូលក្នុង Telegram Group រួចហើយ។';
      } else if (lastTelegramError.includes('bot was blocked')) {
        friendlyError = 'Bot ត្រូវបាន Block! សូម Unblock Bot @Digital_Invitation_Link_bot ក្នុង Telegram។';
      } else if (lastTelegramError.includes('not enough rights')) {
        friendlyError = 'Bot មិនទាន់មានសិទ្ធិផ្ញើសារ/ឯកសារក្នុង Group នេះទេ! សូមផ្ដល់សិទ្ធិ Send Messages/Media ដល់ Bot។';
      }
      return res.status(400).json({ success: false, error: friendlyError, rawError: lastTelegramError });
    }

    // Auto-save this active Chat ID to DB for next time
    try {
      await pool.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('telegram_chat_id', $1, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `, [cleanChatId]);
    } catch (saveErr) {
      console.warn('Could not auto-save telegram_chat_id:', saveErr);
    }

    res.json({
      success: true,
      message: 'បានបាញ់ទៅ Telegram រួចរាល់ដោយជោគជ័យ!',
      documentSent,
      messageSent,
      chatId: cleanChatId
    });
  } catch (err: any) {
    console.error('Error in /api/telegram/send:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error sending to Telegram' });
  }
});

// Global JSON error handler to prevent HTML error leak to API consumers
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled API Error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    status
  });
});

// 404 handler for unknown API routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

export default app;
