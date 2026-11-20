import { Product, RestockItem } from '../types';

// Universal API base URL: works on Vercel production, local Vite dev (via proxy), and mobile Wi-Fi
export const API_BASE_URL = '/api';

export interface HealthStatus {
  connected: boolean;
  database?: string;
  provider?: string;
  neonTime?: string;
  error?: string;
}

export const api = {
  async checkHealth(): Promise<HealthStatus> {
    try {
      // Safe cross-browser timeout (supports older iOS Safari & Android browsers)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Health check failed');
      const data = await res.json();
      return {
        connected: true,
        database: data.database,
        provider: data.provider,
        neonTime: data.neonTime
      };
    } catch (err: any) {
      return {
        connected: false,
        error: err.message
      };
    }
  },

  async getProducts(): Promise<Product[]> {
    const res = await fetch(`${API_BASE_URL}/products`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },

  async createProduct(product: Partial<Product>): Promise<Product> {
    const res = await fetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create product');
    }
    return res.json();
  },

  async getRestockItems(): Promise<RestockItem[]> {
    const res = await fetch(`${API_BASE_URL}/restock`);
    if (!res.ok) throw new Error('Failed to fetch restock items');
    return res.json();
  },

  async scanBarcode(barcode: string): Promise<{
    found: boolean;
    action?: 'added' | 'already_exists';
    message?: string;
    item?: RestockItem;
    barcode?: string;
  }> {
    const res = await fetch(`${API_BASE_URL}/restock/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode })
    });

    if (res.status === 404) {
      const data = await res.json();
      return { found: false, barcode: data.barcode || barcode };
    }

    if (!res.ok) {
      throw new Error('Scan request failed');
    }

    return res.json();
  },

  async updateQuantity(
    itemId: string, 
    orderQuantity: number, 
    productId?: string, 
    barcode?: string, 
    note?: string
  ): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/restock/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderQuantity, productId, barcode, note })
    });
    return res.ok;
  },

  async deleteRestockItem(itemId: string, productId?: string, barcode?: string): Promise<boolean> {
    const params = new URLSearchParams();
    if (productId) params.append('productId', productId);
    if (barcode) params.append('barcode', barcode);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`${API_BASE_URL}/restock/${encodeURIComponent(itemId)}${qs}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async clearRestockItems(): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/restock`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async deleteProduct(productId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/products/${productId}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async syncBatchRestockItems(items: RestockItem[]): Promise<{ count: number; items: RestockItem[] }> {
    const res = await fetch(`${API_BASE_URL}/restock/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) throw new Error('Failed to batch sync restock items');
    return res.json();
  },

  async createProductsBatch(products: Partial<Product>[]): Promise<{ count: number }> {
    const res = await fetch(`${API_BASE_URL}/products/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products })
    });
    if (!res.ok) throw new Error('Failed to batch import products');
    return res.json();
  }
};
