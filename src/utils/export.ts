import * as XLSX from 'xlsx';
import { RestockItem } from '../types';

export type OrderDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

// Helper to determine today's day of week
export const getCurrentDayOfWeek = (): OrderDay => {
  const dayIndex = new Date().getDay(); // 0 is Sun, 1 is Mon, etc.
  const days: OrderDay[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex] || 'Thu';
};

// Helper to determine storage temperature from category
const extractStorageTemp = (category: string): string => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('chilled')) return 'Chilled';
  if (cat.includes('frozen')) return 'Frozen';
  if (cat.includes('dry')) return 'Dry';
  return 'Dry';
};

// Helper to determine department sheet name
const extractSheetName = (category: string): string => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('bakery') || cat.includes('cake')) return 'Bakery and Cake';
  if (cat.includes('fresh') || cat.includes('fruit') || cat.includes('seafood')) return 'Fresh';
  if (cat.includes('milk') || cat.includes('yogurt') || cat.includes('dairy')) return ' Milk and Yogurt';
  return 'Daily';
};

// Helper to clean vendor and extract remark
const parseVendorAndRemark = (supplierName: string): { vendor: string; remark: string } => {
  const raw = supplierName || '';
  const match = raw.match(/^(.*?)\s*\[(.*?)\]$/);
  if (match) {
    return {
      vendor: match[1].trim(),
      remark: match[2].trim()
    };
  }
  return {
    vendor: raw.trim(),
    remark: 'Delivery on Thu'
  };
};

/**
 * Main Export: Store Daily Plan Format with prominent "ចំនួនត្រូវទិញ (Order Qty)" column
 * and Department Sheets ('Daily', 'Bakery and Cake', 'Fresh', ' Milk and Yogurt')
 */
export const exportDailyPlanExcel = (
  items: RestockItem[], 
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): boolean => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => i.product.supplierName === supplierFilter)
    : items;

  if (filteredItems.length === 0) return false;

  // Exact Daily Plan Columns enhanced with explicit "ចំនួនត្រូវទិញ (Order Qty)" & Costs
  const headers = [
    'Storage Temperature',
    'Item Code',
    'Name',
    'Name in Khmer',
    'Vendors/Vendor',
    'Purchase UoM',
    'ចំនួនត្រូវទិញ (Order Qty)',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
    'តម្លៃដើមឯកតា (Unit Cost)',
    'សរុបទឹកប្រាក់ (Total Cost)',
    'Remark'
  ];

  const colWidths = [
    { wch: 18 }, // Storage Temperature
    { wch: 18 }, // Item Code
    { wch: 38 }, // Name
    { wch: 30 }, // Name in Khmer
    { wch: 18 }, // Vendors/Vendor
    { wch: 14 }, // Purchase UoM
    { wch: 22 }, // ចំនួនត្រូវទិញ (Order Qty)
    { wch: 8 },  // Mon
    { wch: 8 },  // Tue
    { wch: 8 },  // Wed
    { wch: 8 },  // Thu
    { wch: 8 },  // Fri
    { wch: 8 },  // Sat
    { wch: 8 },  // Sun
    { wch: 16 }, // Unit Cost
    { wch: 16 }, // Total Cost
    { wch: 25 }  // Remark
  ];

  // Group items by Department Sheet
  const sheetsData: Record<string, any[]> = {
    'Daily': [],
    'Bakery and Cake': [],
    'Fresh': [],
    ' Milk and Yogurt': []
  };

  filteredItems.forEach(item => {
    const temp = extractStorageTemp(item.product.category);
    const sheet = extractSheetName(item.product.category);
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);

    const row: Record<string, any> = {
      'Storage Temperature': temp,
      'Item Code': item.product.barcode,
      'Name': item.product.name,
      'Name in Khmer': item.product.khmerName || '',
      'Vendors/Vendor': vendor,
      'Purchase UoM': item.product.unit || 'Units',
      'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity, // Explicit quantity column!
      'Mon': orderDay === 'Mon' ? item.orderQuantity : '',
      'Tue': orderDay === 'Tue' ? item.orderQuantity : '',
      'Wed': orderDay === 'Wed' ? item.orderQuantity : '',
      'Thu': orderDay === 'Thu' ? item.orderQuantity : '',
      'Fri': orderDay === 'Fri' ? item.orderQuantity : '',
      'Sat': orderDay === 'Sat' ? item.orderQuantity : '',
      'Sun': orderDay === 'Sun' ? item.orderQuantity : '',
      'តម្លៃដើមឯកតា (Unit Cost)': `$${item.unitCost.toFixed(2)}`,
      'សរុបទឹកប្រាក់ (Total Cost)': `$${item.totalCost.toFixed(2)}`,
      'Remark': remark
    };

    if (sheetsData[sheet]) {
      sheetsData[sheet].push(row);
    } else {
      sheetsData['Daily'].push(row);
    }
  });

  const workbook = XLSX.utils.book_new();

  // 1. ADD SUMMARY SHEET: All ordered products in one clean sheet
  const summaryHeaders = [
    'ល.រ',
    'កូដទំនិញ (Barcode)',
    'ឈ្មោះទំនិញ (Product Name)',
    'ឈ្មោះខ្មែរ (Khmer Name)',
    'ផ្នែក (Department)',
    'អ្នកផ្គត់ផ្គង់ (Vendor)',
    'ឯកតា (Unit)',
    'ចំនួនត្រូវទិញ (Order Qty)',
    'តម្លៃដើមឯកតា (Unit Cost)',
    'សរុបទឹកប្រាក់ (Total Cost)',
    'ថ្ងៃកុម្ម៉ង់ (Order Day)',
    'Remark'
  ];

  const summaryRows = filteredItems.map((item, idx) => {
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    return {
      'ល.រ': idx + 1,
      'កូដទំនិញ (Barcode)': item.product.barcode,
      'ឈ្មោះទំនិញ (Product Name)': item.product.name,
      'ឈ្មោះខ្មែរ (Khmer Name)': item.product.khmerName || '',
      'ផ្នែក (Department)': extractSheetName(item.product.category).trim(),
      'អ្នកផ្គត់ផ្គង់ (Vendor)': vendor,
      'ឯកតា (Unit)': item.product.unit || 'Units',
      'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity,
      'តម្លៃដើមឯកតា (Unit Cost)': `$${item.unitCost.toFixed(2)}`,
      'សរុបទឹកប្រាក់ (Total Cost)': `$${item.totalCost.toFixed(2)}`,
      'ថ្ងៃកុម្ម៉ង់ (Order Day)': orderDay,
      'Remark': remark
    };
  });

  // Add Grand Total row to summary sheet
  const totalQty = filteredItems.reduce((acc, curr) => acc + curr.orderQuantity, 0);
  const totalCost = filteredItems.reduce((acc, curr) => acc + curr.totalCost, 0);
  summaryRows.push({
    'ល.រ': '',
    'កូដទំនិញ (Barcode)': '',
    'ឈ្មោះទំនិញ (Product Name)': 'សរុបរួមទាំងអស់ (GRAND TOTAL)',
    'ឈ្មោះខ្មែរ (Khmer Name)': `${filteredItems.length} មុខទំនិញ`,
    'ផ្នែក (Department)': '',
    'អ្នកផ្គត់ផ្គង់ (Vendor)': '',
    'ឯកតា (Unit)': '',
    'ចំនួនត្រូវទិញ (Order Qty)': totalQty,
    'តម្លៃដើមឯកតា (Unit Cost)': '',
    'សរុបទឹកប្រាក់ (Total Cost)': `$${totalCost.toFixed(2)}`,
    'ថ្ងៃកុម្ម៉ង់ (Order Day)': orderDay,
    'Remark': ''
  } as any);

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders });
  wsSummary['!cols'] = [
    { wch: 6 },  // ល.រ
    { wch: 18 }, // Barcode
    { wch: 38 }, // Name
    { wch: 30 }, // Khmer Name
    { wch: 18 }, // Department
    { wch: 18 }, // Vendor
    { wch: 12 }, // Unit
    { wch: 22 }, // ចំនួនត្រូវទិញ (Order Qty)
    { wch: 16 }, // Unit Cost
    { wch: 16 }, // Total Cost
    { wch: 14 }, // Order Day
    { wch: 24 }  // Remark
  ];
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'បញ្ជីទិញសរុប (PO Summary)');

  // 2. ADD DEPARTMENT SHEETS matching Store Daily Plan structure (always include all 4 tabs)
  const sheetOrder = ['Daily', 'Bakery and Cake', 'Fresh', ' Milk and Yogurt'];
  for (const sheetName of sheetOrder) {
    const rows = sheetsData[sheetName] || [];
    if (rows.length > 0) {
      // Add sheet subtotal row
      const sheetQty = rows.reduce((acc, r) => acc + (parseInt(r['ចំនួនត្រូវទិញ (Order Qty)'], 10) || 0), 0);
      const sheetCost = rows.reduce((acc, r) => {
        const val = parseFloat(String(r['សរុបទឹកប្រាក់ (Total Cost)']).replace('$', '')) || 0;
        return acc + val;
      }, 0);

      const rowsWithSubtotal = [
        ...rows,
        {
          'Storage Temperature': '',
          'Item Code': '',
          'Name': `សរុបផ្នែក ${sheetName.trim()} (${rows.length} មុខ)`,
          'Name in Khmer': '',
          'Vendors/Vendor': '',
          'Purchase UoM': '',
          'ចំនួនត្រូវទិញ (Order Qty)': sheetQty,
          'Mon': orderDay === 'Mon' ? sheetQty : '',
          'Tue': orderDay === 'Tue' ? sheetQty : '',
          'Wed': orderDay === 'Wed' ? sheetQty : '',
          'Thu': orderDay === 'Thu' ? sheetQty : '',
          'Fri': orderDay === 'Fri' ? sheetQty : '',
          'Sat': orderDay === 'Sat' ? sheetQty : '',
          'Sun': orderDay === 'Sun' ? sheetQty : '',
          'តម្លៃដើមឯកតា (Unit Cost)': '',
          'សរុបទឹកប្រាក់ (Total Cost)': `$${sheetCost.toFixed(2)}`,
          'Remark': ''
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rowsWithSubtotal, { header: headers });
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    } else {
      // Keep sheet with headers so all department tabs exist in template
      const ws = XLSX.utils.json_to_sheet([], { header: headers });
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    }
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Daily_Order_Plan_${orderDay}_${dateStr}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return true;
};

// Alias for backwards compatibility
export const exportToTakeoPlanExcel = exportDailyPlanExcel;

/**
 * Simple Clean PO Export (Single Sheet)
 */
export const exportToSimplePOExcel = (items: RestockItem[], supplierFilter?: string): boolean => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => i.product.supplierName === supplierFilter)
    : items;

  if (filteredItems.length === 0) return false;

  const rows = filteredItems.map((item, index) => ({
    'ល.រ (No.)': index + 1,
    'បារកូដ (Barcode)': item.product.barcode,
    'ឈ្មោះទំនិញ (Product Name)': item.product.name,
    'ឈ្មោះខ្មែរ (Khmer Name)': item.product.khmerName || '',
    'ប្រភេទ (Category)': item.product.category,
    'ឯកតា (Unit)': item.product.unit,
    'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity,
    'តម្លៃដើមឯកតា (Unit Cost)': `$${item.unitCost.toFixed(2)}`,
    'សរុបទឹកប្រាក់ (Total Cost)': `$${item.totalCost.toFixed(2)}`,
    'អ្នកផ្គត់ផ្គង់ (Supplier)': item.product.supplierName,
    'លេខទូរស័ព្ទ (Phone)': item.product.supplierPhone || '',
    'ម៉ោងស្កេន (Scanned At)': new Date(item.scannedAt).toLocaleString('km-KH')
  }));

  // Add Grand Total row
  const totalQty = filteredItems.reduce((acc, curr) => acc + curr.orderQuantity, 0);
  const totalCost = filteredItems.reduce((acc, curr) => acc + curr.totalCost, 0);
  rows.push({
    'ល.រ (No.)': '' as any,
    'បារកូដ (Barcode)': '',
    'ឈ្មោះទំនិញ (Product Name)': 'សរុបរួម (GRAND TOTAL)',
    'ឈ្មោះខ្មែរ (Khmer Name)': `${filteredItems.length} មុខទំនិញ`,
    'ប្រភេទ (Category)': '',
    'ឯកតា (Unit)': '',
    'ចំនួនត្រូវទិញ (Order Qty)': totalQty,
    'តម្លៃដើមឯកតា (Unit Cost)': '' as any,
    'សរុបទឹកប្រាក់ (Total Cost)': `$${totalCost.toFixed(2)}` as any,
    'អ្នកផ្គត់ផ្គង់ (Supplier)': '',
    'លេខទូរស័ព្ទ (Phone)': '',
    'ម៉ោងស្កេន (Scanned At)': ''
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'បញ្ជីទំនិញត្រូវទិញ');

  worksheet['!cols'] = [
    { wch: 8 },  // No
    { wch: 18 }, // Barcode
    { wch: 34 }, // Name
    { wch: 28 }, // Khmer Name
    { wch: 22 }, // Category
    { wch: 10 }, // Unit
    { wch: 22 }, // Order Qty
    { wch: 14 }, // Unit Cost
    { wch: 14 }, // Total Cost
    { wch: 28 }, // Supplier
    { wch: 16 }, // Phone
    { wch: 20 }, // Time
  ];

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `PO_Order_List_${dateStr}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return true;
};

export const copyToTelegramClipboard = async (
  items: RestockItem[], 
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): Promise<boolean> => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => i.product.supplierName === supplierFilter)
    : items;

  const totalCost = filteredItems.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalQty = filteredItems.reduce((acc, curr) => acc + curr.orderQuantity, 0);
  const dateStr = new Date().toLocaleDateString('km-KH');

  let text = `📦 *តារាងបញ្ជាទិញទំនិញ (Daily Order Plan)*\n`;
  text += `📅 កាលបរិច្ឆេទ: ${dateStr} (ថ្ងៃ ${orderDay})\n`;
  if (supplierFilter && supplierFilter !== 'all') {
    text += `🏢 អ្នកផ្គត់ផ្គង់: *${supplierFilter}*\n`;
  }
  text += `------------------------------------\n`;

  filteredItems.forEach((item, idx) => {
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    text += `${idx + 1}. *${item.product.name}*\n`;
    if (item.product.khmerName) text += `   (${item.product.khmerName})\n`;
    text += `   🏷 Code: \`${item.product.barcode}\` | Vendor: ${vendor}\n`;
    text += `   🔢 ចំនួនត្រូវទិញ [${orderDay}]: *${item.orderQuantity} ${item.product.unit}*\n`;
    if (remark) text += `   🚚 ${remark}\n`;
  });

  text += `------------------------------------\n`;
  text += `📊 សរុបមុខទំនិញ: ${filteredItems.length} មុខ\n`;
  text += `📦 សរុបចំនួនទិញ: ${totalQty}\n`;
  if (totalCost > 0) {
    text += `💰 សរុបទឹកប្រាក់: *$${totalCost.toFixed(2)}*\n`;
  }
  text += `\n_បង្កើតដោយប្រព័ន្ធ Mart Scan & Order_`;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};
