import { Product, RestockItem } from '../types';
import { INITIAL_PRODUCTS } from '../data/mockProducts';

const STORAGE_KEYS = {
  PRODUCTS: 'mart_scan_products_v1',
  RESTOCK_ITEMS: 'mart_scan_restock_v1',
  OFFLINE_DIRTY: 'mart_scan_offline_dirty_v1',
  SETTINGS: 'mart_scan_settings_v1',
};

export interface OfflineDirtyOp {
  type: 'upsert' | 'delete';
  productId: string;
  barcode?: string;
  item?: RestockItem;
  timestamp: number;
}

export const getStoredProducts = (): Product[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading products from storage:', e);
  }
  saveProducts(INITIAL_PRODUCTS);
  return INITIAL_PRODUCTS;
};

export const saveProducts = (products: Product[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  } catch (e: any) {
    console.error('Error saving products:', e);
    // If quota exceeded, strip heavy images and try again so barcodes and essential product data are saved
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      try {
        const lean = products.map(({ image, ...rest }) => rest);
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(lean));
      } catch (inner) {
        console.warn('Could not save lean products to localStorage:', inner);
      }
    }
  }
};

export const getStoredRestockItems = (): RestockItem[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RESTOCK_ITEMS);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading restock items:', e);
  }
  return [];
};

export const saveRestockItems = (items: RestockItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.RESTOCK_ITEMS, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving restock items:', e);
  }
};

export const getOfflineDirtyOps = (): OfflineDirtyOp[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_DIRTY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading offline dirty queue:', e);
  }
  return [];
};

export const upsertOfflineDirtyOp = (op: OfflineDirtyOp) => {
  try {
    const ops = getOfflineDirtyOps().filter(o => o.productId !== op.productId);
    ops.push(op);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_DIRTY, JSON.stringify(ops));
  } catch (e) {
    console.warn('Error saving offline dirty op:', e);
  }
};

export const removeOfflineDirtyOp = (productId: string) => {
  try {
    const ops = getOfflineDirtyOps().filter(o => o.productId !== productId);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_DIRTY, JSON.stringify(ops));
  } catch (e) {
    console.warn('Error removing offline dirty op:', e);
  }
};

export const clearOfflineDirtyOps = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_DIRTY);
  } catch (e) {
    console.warn('Error clearing offline dirty ops:', e);
  }
};
