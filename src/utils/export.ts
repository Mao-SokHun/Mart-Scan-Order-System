import * as XLSX from 'xlsx';
import { RestockItem } from '../types';

export const exportToExcel = (items: RestockItem[], supplierFilter?: string) => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => i.product.supplierName === supplierFilter)
    : items;

  const rows = filteredItems.map((item, index) => ({
    'ល.រ (No.)': index + 1,
    'បារកូដ (Barcode)': item.product.barcode,
    'ឈ្មោះទំនិញ (Product Name)': item.product.name,
    'ឈ្មោះខ្មែរ (Khmer Name)': item.product.khmerName || '',
    'ប្រភេទ (Category)': item.product.category,
    'ឯកតា (Unit)': item.product.unit,
    'ស្តុកបច្ចុប្បន្ន (Current Stock)': item.product.currentStock,
    'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity,
    'តម្លៃដើមឯកតា (Unit Cost)': `$${item.unitCost.toFixed(2)}`,
    'សរុបទឹកប្រាក់ (Total Cost)': `$${item.totalCost.toFixed(2)}`,
    'អ្នកផ្គត់ផ្គង់ (Supplier)': item.product.supplierName,
    'លេខទូរស័ព្ទ (Phone)': item.product.supplierPhone || '',
    'ម៉ោងស្កេន (Scanned At)': new Date(item.scannedAt).toLocaleString('km-KH')
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'បញ្ជីទំនិញត្រូវទិញ');

  // Auto-fit column width
  const max_widths = [
    { wch: 8 },  // No
    { wch: 18 }, // Barcode
    { wch: 32 }, // Name
    { wch: 28 }, // Khmer Name
    { wch: 22 }, // Category
    { wch: 10 }, // Unit
    { wch: 14 }, // Current Stock
    { wch: 14 }, // Order Qty
    { wch: 14 }, // Unit Cost
    { wch: 14 }, // Total Cost
    { wch: 28 }, // Supplier
    { wch: 16 }, // Phone
    { wch: 20 }, // Time
  ];
  worksheet['!cols'] = max_widths;

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Mart_Restock_Order_${supplierFilter && supplierFilter !== 'all' ? supplierFilter.replace(/[^a-zA-Z0-9]/g, '_') + '_' : ''}${dateStr}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return true;
};

export const copyToTelegramClipboard = async (items: RestockItem[], supplierFilter?: string): Promise<boolean> => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => i.product.supplierName === supplierFilter)
    : items;

  const totalCost = filteredItems.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalQty = filteredItems.reduce((acc, curr) => acc + curr.orderQuantity, 0);
  const dateStr = new Date().toLocaleDateString('km-KH');

  let text = `📦 *តារាងបញ្ជាទិញទំនិញ (Purchase Order)*\n`;
  text += `📅 កាលបរិច្ឆេទ: ${dateStr}\n`;
  if (supplierFilter && supplierFilter !== 'all') {
    text += `🏢 អ្នកផ្គត់ផ្គង់: *${supplierFilter}*\n`;
  }
  text += `------------------------------------\n`;

  filteredItems.forEach((item, idx) => {
    text += `${idx + 1}. *${item.product.name}*\n`;
    if (item.product.khmerName) text += `   (${item.product.khmerName})\n`;
    text += `   🏷 Barcode: \`${item.product.barcode}\`\n`;
    text += `   🔢 ចំនួនត្រូវទិញ: *${item.orderQuantity} ${item.product.unit}* @ $${item.unitCost.toFixed(2)} = $${item.totalCost.toFixed(2)}\n`;
  });

  text += `------------------------------------\n`;
  text += `📊 សរុបមុខទំនិញ: ${filteredItems.length} មុខ\n`;
  text += `📦 សរុបចំនួន: ${totalQty}\n`;
  text += `💰 សរុបទឹកប្រាក់: *$${totalCost.toFixed(2)}*\n`;
  text += `\n_បង្កើតដោយប្រព័ន្ធ Mart Scan & Order_`;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};
