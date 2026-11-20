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
  if (cat.includes('chilled') || cat.includes('ត្រជាក់') || cat.includes('ទឹកដោះគោ') || cat.includes('dairy') || cat.includes('milk') || cat.includes('yogurt')) return 'Chilled';
  if (cat.includes('frozen') || cat.includes('កក')) return 'Frozen';
  if (cat.includes('dry') || cat.includes('ស្ងួត') || cat.includes('ក្រៀម')) return 'Dry';
  return 'Dry';
};

// Helper to determine department sheet name
const extractSheetName = (category: string): string => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('bakery') || cat.includes('cake') || cat.includes('នំបុ័ង')) return 'Bakery and Cake';
  if (cat.includes('fresh') || cat.includes('fruit') || cat.includes('seafood') || cat.includes('ផ្លែឈើ') || cat.includes('បន្លែ') || cat.includes('ស្រស់')) return 'Fresh';
  if (cat.includes('milk') || cat.includes('yogurt') || cat.includes('dairy') || cat.includes('ទឹកដោះគោ') || cat.includes('យ៉ាអួរ')) return ' Milk and Yogurt';
  return 'Daily';
};

// Helper to clean vendor and extract remark
export const parseVendorAndRemark = (supplierName: string): { vendor: string; remark: string } => {
  const raw = supplierName || '';
  const match = raw.match(/^(.*?)\s*\[(.*?)\]$/);
  if (match) {
    return {
      vendor: match[1].trim() || 'ទូទៅ',
      remark: match[2].trim() || ''
    };
  }
  return {
    vendor: raw.trim() || 'ទូទៅ',
    remark: ''
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
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
    : items;

  if (filteredItems.length === 0) return false;

  // Check if any item has pricing specified
  const hasCost = filteredItems.some(i => (i.unitCost || 0) > 0 || (i.totalCost || 0) > 0);

  // Exact Daily Plan Columns: include costs only if products have pricing set
  const headers = hasCost ? [
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
  ] : [
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
    'Remark'
  ];

  const colWidths = hasCost ? [
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
  ] : [
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
      'Sun': orderDay === 'Sun' ? item.orderQuantity : ''
    };

    if (hasCost) {
      row['តម្លៃដើមឯកតា (Unit Cost)'] = `$${(item.unitCost || 0).toFixed(2)}`;
      row['សរុបទឹកប្រាក់ (Total Cost)'] = `$${(item.totalCost || 0).toFixed(2)}`;
    }

    row['Remark'] = remark || item.product.remark || '';

    if (sheetsData[sheet]) {
      sheetsData[sheet].push(row);
    } else {
      sheetsData['Daily'].push(row);
    }
  });

  const workbook = XLSX.utils.book_new();

  // 1. ADD SUMMARY SHEET: All ordered products in one clean sheet
  const summaryHeaders = hasCost ? [
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
  ] : [
    'ល.រ',
    'កូដទំនិញ (Barcode)',
    'ឈ្មោះទំនិញ (Product Name)',
    'ឈ្មោះខ្មែរ (Khmer Name)',
    'ផ្នែក (Department)',
    'អ្នកផ្គត់ផ្គង់ (Vendor)',
    'ឯកតា (Unit)',
    'ចំនួនត្រូវទិញ (Order Qty)',
    'ថ្ងៃកុម្ម៉ង់ (Order Day)',
    'Remark'
  ];

  const summaryRows = filteredItems.map((item, idx) => {
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    const rowObj: Record<string, any> = {
      'ល.រ': idx + 1,
      'កូដទំនិញ (Barcode)': item.product.barcode,
      'ឈ្មោះទំនិញ (Product Name)': item.product.name,
      'ឈ្មោះខ្មែរ (Khmer Name)': item.product.khmerName || '',
      'ផ្នែក (Department)': extractSheetName(item.product.category).trim(),
      'អ្នកផ្គត់ផ្គង់ (Vendor)': vendor,
      'ឯកតា (Unit)': item.product.unit || 'Units',
      'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity
    };

    if (hasCost) {
      rowObj['តម្លៃដើមឯកតា (Unit Cost)'] = `$${(item.unitCost || 0).toFixed(2)}`;
      rowObj['សរុបទឹកប្រាក់ (Total Cost)'] = `$${(item.totalCost || 0).toFixed(2)}`;
    }

    rowObj['ថ្ងៃកុម្ម៉ង់ (Order Day)'] = orderDay;
    rowObj['Remark'] = remark || item.product.remark || '';
    return rowObj;
  });

  // Add Grand Total row to summary sheet
  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  const totalCost = filteredItems.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
  const grandTotalRow: Record<string, any> = {
    'ល.រ': '',
    'កូដទំនិញ (Barcode)': '',
    'ឈ្មោះទំនិញ (Product Name)': 'សរុបរួមទាំងអស់ (GRAND TOTAL)',
    'ឈ្មោះខ្មែរ (Khmer Name)': `${filteredItems.length} មុខទំនិញ`,
    'ផ្នែក (Department)': '',
    'អ្នកផ្គត់ផ្គង់ (Vendor)': '',
    'ឯកតា (Unit)': '',
    'ចំនួនត្រូវទិញ (Order Qty)': totalQty
  };

  if (hasCost) {
    grandTotalRow['តម្លៃដើមឯកតា (Unit Cost)'] = '';
    grandTotalRow['សរុបទឹកប្រាក់ (Total Cost)'] = `$${(totalCost || 0).toFixed(2)}`;
  }

  grandTotalRow['ថ្ងៃកុម្ម៉ង់ (Order Day)'] = orderDay;
  grandTotalRow['Remark'] = '';
  summaryRows.push(grandTotalRow as any);

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders });
  wsSummary['!cols'] = hasCost ? [
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
  ] : [
    { wch: 6 },  // ល.រ
    { wch: 18 }, // Barcode
    { wch: 38 }, // Name
    { wch: 30 }, // Khmer Name
    { wch: 18 }, // Department
    { wch: 18 }, // Vendor
    { wch: 12 }, // Unit
    { wch: 22 }, // ចំនួនត្រូវទិញ (Order Qty)
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
      const subtotalRow: Record<string, any> = {
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
        'Sun': orderDay === 'Sun' ? sheetQty : ''
      };

      if (hasCost) {
        const sheetCost = rows.reduce((acc, r) => {
          const val = parseFloat(String(r['សរុបទឹកប្រាក់ (Total Cost)']).replace('$', '')) || 0;
          return acc + val;
        }, 0);
        subtotalRow['តម្លៃដើមឯកតា (Unit Cost)'] = '';
        subtotalRow['សរុបទឹកប្រាក់ (Total Cost)'] = `$${sheetCost.toFixed(2)}`;
      }

      subtotalRow['Remark'] = '';

      const rowsWithSubtotal = [...rows, subtotalRow];
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
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
    : items;

  if (filteredItems.length === 0) return false;

  const hasCost = filteredItems.some(i => (i.unitCost || 0) > 0 || (i.totalCost || 0) > 0);

  const rows = filteredItems.map((item, index) => {
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    const rowObj: Record<string, any> = {
      'ល.រ (No.)': index + 1,
      'បារកូដ (Barcode)': item.product.barcode,
      'ឈ្មោះទំនិញ (Product Name)': item.product.name,
      'ឈ្មោះខ្មែរ (Khmer Name)': item.product.khmerName || '',
      'ប្រភេទ/ផ្នែក (Category)': item.product.category,
      'អ្នកផ្គត់ផ្គង់ (Supplier)': vendor,
      'ឯកតាទិញ (Unit)': item.product.unit || 'Units',
      'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity
    };

    if (hasCost) {
      rowObj['តម្លៃដើមឯកតា (Unit Cost)'] = `$${(item.unitCost || 0).toFixed(2)}`;
      rowObj['សរុបទឹកប្រាក់ (Total Cost)'] = `$${(item.totalCost || 0).toFixed(2)}`;
    }

    rowObj['កំណត់សម្គាល់ (Remark)'] = remark || item.product.remark || '';
    rowObj['លេខទូរស័ព្ទ (Phone)'] = item.product.supplierPhone || '';
    rowObj['ម៉ោងស្កេន (Scanned At)'] = (() => {
      try {
        return item.scannedAt ? new Date(item.scannedAt).toLocaleString('km-KH') : '';
      } catch {
        return item.scannedAt ? new Date(item.scannedAt).toLocaleString() : '';
      }
    })();

    return rowObj;
  });

  // Add Grand Total row
  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  const totalCost = filteredItems.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
  const grandTotalRow: Record<string, any> = {
    'ល.រ (No.)': '' as any,
    'បារកូដ (Barcode)': '',
    'ឈ្មោះទំនិញ (Product Name)': 'សរុបរួម (GRAND TOTAL)',
    'ឈ្មោះខ្មែរ (Khmer Name)': `${filteredItems.length} មុខទំនិញ`,
    'ប្រភេទ/ផ្នែក (Category)': '',
    'អ្នកផ្គត់ផ្គង់ (Supplier)': '',
    'ឯកតាទិញ (Unit)': '',
    'ចំនួនត្រូវទិញ (Order Qty)': totalQty
  };

  if (hasCost) {
    grandTotalRow['តម្លៃដើមឯកតា (Unit Cost)'] = '' as any;
    grandTotalRow['សរុបទឹកប្រាក់ (Total Cost)'] = `$${totalCost.toFixed(2)}` as any;
  }

  grandTotalRow['កំណត់សម្គាល់ (Remark)'] = '';
  grandTotalRow['លេខទូរស័ព្ទ (Phone)'] = '';
  grandTotalRow['ម៉ោងស្កេន (Scanned At)'] = '';
  rows.push(grandTotalRow as any);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'បញ្ជីទំនិញត្រូវទិញ');

  worksheet['!cols'] = hasCost ? [
    { wch: 8 },  // No
    { wch: 18 }, // Barcode
    { wch: 34 }, // Name
    { wch: 28 }, // Khmer Name
    { wch: 22 }, // Category
    { wch: 20 }, // Supplier
    { wch: 12 }, // Unit
    { wch: 22 }, // Order Qty
    { wch: 14 }, // Unit Cost
    { wch: 14 }, // Total Cost
    { wch: 20 }, // Remark
    { wch: 16 }, // Phone
    { wch: 20 }, // Time
  ] : [
    { wch: 8 },  // No
    { wch: 18 }, // Barcode
    { wch: 34 }, // Name
    { wch: 28 }, // Khmer Name
    { wch: 22 }, // Category
    { wch: 20 }, // Supplier
    { wch: 14 }, // Unit
    { wch: 22 }, // Order Qty
    { wch: 22 }, // Remark
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
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
    : items;

  if (filteredItems.length === 0) return false;

  const totalCost = filteredItems.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  let dateStr = '';
  try {
    dateStr = new Date().toLocaleDateString('km-KH');
  } catch {
    dateStr = new Date().toLocaleDateString();
  }

  const cleanTg = (str?: string) => (str || '').replace(/[*_`]/g, ' ').trim();

  let text = `📦 *តារាងបញ្ជាទិញទំនិញ (Daily Order Plan)*\n`;
  text += `📅 កាលបរិច្ឆេទ: ${dateStr} (ថ្ងៃ ${orderDay})\n`;
  if (supplierFilter && supplierFilter !== 'all') {
    text += `🏢 អ្នកផ្គត់ផ្គង់: *${cleanTg(supplierFilter)}*\n`;
  }
  text += `------------------------------------\n`;

  filteredItems.forEach((item, idx) => {
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    const safeName = cleanTg(item.product.name);
    const safeKhmer = cleanTg(item.product.khmerName);
    const safeVendor = cleanTg(vendor);
    const safeUnit = cleanTg(item.product.unit || 'Units');
    const safeRemark = cleanTg(remark);

    text += `${idx + 1}. *${safeName}*\n`;
    if (safeKhmer) text += `   (${safeKhmer})\n`;
    text += `   🏷 Code: \`${item.product.barcode}\` | Vendor: ${safeVendor}\n`;
    text += `   🔢 ចំនួនត្រូវទិញ [${orderDay}]: *${item.orderQuantity}* ${safeUnit}\n`;
    if (safeRemark) text += `   🚚 ${safeRemark}\n`;
  });

  text += `------------------------------------\n`;
  text += `📊 សរុបមុខទំនិញ: ${filteredItems.length} មុខ\n`;
  text += `📦 សរុបចំនួនទិញ: ${totalQty}\n`;
  if (totalCost > 0) {
    text += `💰 សរុបទឹកប្រាក់: *$${totalCost.toFixed(2)}*\n`;
  }
  text += `\n_បង្កើតដោយប្រព័ន្ធ Mart Scan & Order_`;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for mobile Safari / older webviews / non-HTTPS
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};
