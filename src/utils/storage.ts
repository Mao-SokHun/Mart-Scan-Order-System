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
      return JSON.parse(data);
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
  } catch (e) {
    console.error('Error saving products:', e);
  }
};

export const getStoredRestockItems = (): RestockItem[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RESTOCK_ITEMS);
    if (data) {
      return JSON.parse(data);
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
