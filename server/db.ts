import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const initDb = async () => {
  const client = await pool.connect();
  try {
    console.log('🔗 Connecting to Neon PostgreSQL...');

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
        order_quantity INTEGER NOT NULL DEFAULT 1,
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

    console.log('✅ PostgreSQL Tables verified/created successfully!');

    // Check if initial products exist, if not seed them
    const countRes = await client.query('SELECT COUNT(*) FROM products;');
    const count = parseInt(countRes.rows[0].count, 10);
    
    if (count === 0) {
      console.log('🌱 Seeding initial sample products to Neon PostgreSQL...');
      const seedProducts = [
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

      for (const p of seedProducts) {
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
    } else {
      console.log(`ℹ️ Neon PostgreSQL already contains ${count} products.`);
    }
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
};
