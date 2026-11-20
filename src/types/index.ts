export interface Product {
  id: string;
  barcode: string;
  name: string;
  khmerName?: string;
  category: string;
  unit: string; // e.g. កំប៉ុង, កញ្ចប់, ដប, ប្រអប់, ឡូ
  costPrice: number; // USD or Riel (e.g. 0.50)
  sellingPrice: number;
  currentStock: number;
  minStock: number; // Reorder threshold
  supplierName: string;
  supplierPhone?: string;
  remark?: string;
  storageTemp?: 'Dry' | 'Chilled' | 'Frozen' | string;
  image?: string;
}

export interface RestockItem {
  id: string; // unique item id in order
  product: Product;
  orderQuantity: number;
  scannedAt: string;
  unitCost: number;
  totalCost: number;
  note?: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  supplierName: string;
  items: RestockItem[];
  totalAmount: number;
  status: 'draft' | 'ordered' | 'received';
  notes?: string;
}
