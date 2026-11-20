import { Product, RestockItem } from '../types';
import { INITIAL_PRODUCTS } from '../data/mockProducts';

const STORAGE_KEYS = {
  PRODUCTS: 'mart_scan_products_v1',
  RESTOCK_ITEMS: 'mart_scan_restock_v1',
  SETTINGS: 'mart_scan_settings_v1',
};

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
  // Default to mock data
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
