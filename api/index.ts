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
  }
});

let isDbInitialized = false;

export const initDb = async () => {
  if (isDbInitialized) return;
  const client = await pool.connect();
  try {
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create restock_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS restock_items (
        id VARCHAR(64) PRIMARY KEY,
        product_id VARCHAR(64) REFERENCES products(id) ON DELETE CASCADE,
        barcode VARCHAR(128) NOT NULL,
        order_quantity INTEGER NOT NULL DEFAULT 0,
        unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(32) DEFAULT 'pending',
        note TEXT
      );
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

    isDbInitialized = true;
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
};

export const app = express();

app.use(cors());
app.use(express.json());

// Helper to map DB snake_case product row to frontend Product type
const mapProduct = (row: any) => ({
  id: row.id,
  barcode: row.barcode,
  name: row.name,
  khmerName: row.khmer_name || undefined,
  category: row.category,
  unit: row.unit,
  costPrice: parseFloat(row.cost_price),
  sellingPrice: parseFloat(row.selling_price),
  currentStock: parseInt(row.current_stock, 10),
  minStock: parseInt(row.min_stock, 10),
  supplierName: row.supplier_name,
  supplierPhone: row.supplier_phone || undefined,
  image: row.image || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// Helper to map DB row to RestockItem
const mapRestockItem = (row: any) => ({
  id: row.id,
  product: mapProduct(row),
  orderQuantity: parseInt(row.order_quantity, 10),
  scannedAt: row.scanned_at,
  unitCost: parseFloat(row.unit_cost),
  totalCost: parseFloat(row.total_cost),
  status: row.status,
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

// 2. GET all products
app.get('/api/products', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY name ASC;');
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
    const result = await pool.query('SELECT * FROM products WHERE barcode = $1 LIMIT 1;', [barcode.trim()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', barcode });
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
      supplierName, supplierPhone, image
    } = req.body;

    if (!barcode || !name) {
      return res.status(400).json({ error: 'Barcode and Name are required' });
    }

    const id = `p-${Date.now()}`;
    const result = await pool.query(`
      INSERT INTO products (
        id, barcode, name, khmer_name, category, unit,
        cost_price, selling_price, current_stock, min_stock,
        supplier_name, supplier_phone, image
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `, [
      id, barcode.trim(), name.trim(), khmerName?.trim() || null,
      category || 'ផ្សេងៗ (Other)', unit || 'កំប៉ុង',
      parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0,
      parseInt(currentStock, 10) || 0, parseInt(minStock, 10) || 10,
      supplierName?.trim() || 'ទូទៅ', supplierPhone?.trim() || null,
      image || null
    ]);

    res.status(201).json(mapProduct(result.rows[0]));
  } catch (err: any) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. GET current restock items
app.get('/api/restock', async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
        p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
        p.cost_price, p.selling_price, p.current_stock, p.min_stock,
        p.supplier_name, p.supplier_phone, p.image, p.created_at, p.updated_at
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

// 6. POST /api/restock/scan - CORE SCAN ENDPOINT
app.post('/api/restock/scan', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    const cleanBarcode = barcode.trim();

    // 1. Find product
    const prodRes = await pool.query('SELECT * FROM products WHERE barcode = $1 LIMIT 1;', [cleanBarcode]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ found: false, barcode: cleanBarcode, message: 'Barcode not found in catalog' });
    }

    const prod = prodRes.rows[0];
    const costPrice = parseFloat(prod.cost_price) || 0;

    // 2. Check if already in restock_items
    const existingRes = await pool.query(
      'SELECT * FROM restock_items WHERE product_id = $1 LIMIT 1;',
      [prod.id]
    );

    if (existingRes.rows.length > 0) {
      // ITEM ALREADY EXISTS: Do NOT auto-increment (+1) to avoid accidental duplicate orders!
      const existing = existingRes.rows[0];
      const itemRes = await pool.query(`
        SELECT 
          r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
          p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
          p.cost_price, p.selling_price, p.current_stock, p.min_stock,
          p.supplier_name, p.supplier_phone, p.image, p.created_at, p.updated_at
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
    } else {
      // Insert new item with initial order_quantity = 0 so Admin explicitly enters the number
      const newId = `item-${Date.now()}`;
      const defaultQty = 0;
      const totalCost = 0;

      await pool.query(`
        INSERT INTO restock_items (
          id, product_id, barcode, order_quantity, unit_cost, total_cost, scanned_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP);
      `, [newId, prod.id, prod.barcode, defaultQty, costPrice, totalCost]);

      const itemRes = await pool.query(`
        SELECT 
          r.id, r.order_quantity, r.unit_cost, r.total_cost, r.scanned_at, r.status, r.note,
          p.id as product_id, p.barcode, p.name, p.khmer_name, p.category, p.unit,
          p.cost_price, p.selling_price, p.current_stock, p.min_stock,
          p.supplier_name, p.supplier_phone, p.image, p.created_at, p.updated_at
        FROM restock_items r
        JOIN products p ON r.product_id = p.id
        WHERE r.id = $1;
      `, [newId]);

      return res.json({
        found: true,
        action: 'added',
        message: 'បានបញ្ចូលក្នុងតារាង! រង់ចាំ Admin វាយចំនួន',
        item: mapRestockItem(itemRes.rows[0])
      });
    }
  } catch (err: any) {
    console.error('Error during scan:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. PUT update quantity of restock item
app.put('/api/restock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orderQuantity } = req.body;
    const qty = Math.max(0, parseInt(orderQuantity, 10) || 0);

    const check = await pool.query('SELECT unit_cost FROM restock_items WHERE id = $1;', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const unitCost = parseFloat(check.rows[0].unit_cost);
    const totalCost = qty * unitCost;

    await pool.query(`
      UPDATE restock_items
      SET order_quantity = $1, total_cost = $2
      WHERE id = $3;
    `, [qty, totalCost, id]);

    res.json({ success: true, orderQuantity: qty, totalCost });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. DELETE single item from restock list
app.delete('/api/restock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM restock_items WHERE id = $1;', [id]);
    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. DELETE clear all restock items
app.delete('/api/restock', async (_req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM restock_items;');
    res.json({ success: true, message: 'All restock items cleared' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default app;
