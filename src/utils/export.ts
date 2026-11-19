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

export const exportToTakeoPlanExcel = (
  items: RestockItem[], 
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): boolean => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => i.product.supplierName === supplierFilter)
    : items;

  if (filteredItems.length === 0) return false;

  // The 14 exact columns from New Daily Plan for store Takeo
  const headers = [
    'Storage Temperature',
    'Item Code',
    'Name',
    'Name in Khmer',
    'Vendors/Vendor',
    'Purchase UoM',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
    'Remark'
  ];

  const colWidths = [
    { wch: 18 }, // Storage Temperature
    { wch: 18 }, // Item Code
    { wch: 40 }, // Name
    { wch: 32 }, // Name in Khmer
    { wch: 18 }, // Vendors/Vendor
    { wch: 14 }, // Purchase UoM
    { wch: 8 },  // Mon
    { wch: 8 },  // Tue
    { wch: 8 },  // Wed
    { wch: 8 },  // Thu
    { wch: 8 },  // Fri
    { wch: 8 },  // Sat
    { wch: 8 },  // Sun
    { wch: 30 }  // Remark
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
      'Mon': orderDay === 'Mon' ? item.orderQuantity : '',
      'Tue': orderDay === 'Tue' ? item.orderQuantity : '',
      'Wed': orderDay === 'Wed' ? item.orderQuantity : '',
      'Thu': orderDay === 'Thu' ? item.orderQuantity : '',
      'Fri': orderDay === 'Fri' ? item.orderQuantity : '',
      'Sat': orderDay === 'Sat' ? item.orderQuantity : '',
      'Sun': orderDay === 'Sun' ? item.orderQuantity : '',
      'Remark': remark
    };

    if (sheetsData[sheet]) {
      sheetsData[sheet].push(row);
    } else {
      sheetsData['Daily'].push(row);
    }
  });

  const workbook = XLSX.utils.book_new();
  let addedSheets = 0;

  // Append sheets that have data in them
  const sheetOrder = ['Daily', 'Bakery and Cake', 'Fresh', ' Milk and Yogurt'];
  for (const sheetName of sheetOrder) {
    const rows = sheetsData[sheetName];
    if (rows && rows.length > 0) {
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      addedSheets++;
    }
  }

  // Fallback: If no sheet matched, add all in one sheet
  if (addedSheets === 0) {
    const allRows = filteredItems.map(item => {
      const temp = extractStorageTemp(item.product.category);
      const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
      return {
        'Storage Temperature': temp,
        'Item Code': item.product.barcode,
        'Name': item.product.name,
        'Name in Khmer': item.product.khmerName || '',
        'Vendors/Vendor': vendor,
        'Purchase UoM': item.product.unit || 'Units',
        'Mon': orderDay === 'Mon' ? item.orderQuantity : '',
        'Tue': orderDay === 'Tue' ? item.orderQuantity : '',
        'Wed': orderDay === 'Wed' ? item.orderQuantity : '',
        'Thu': orderDay === 'Thu' ? item.orderQuantity : '',
        'Fri': orderDay === 'Fri' ? item.orderQuantity : '',
        'Sat': orderDay === 'Sat' ? item.orderQuantity : '',
        'Sun': orderDay === 'Sun' ? item.orderQuantity : '',
        'Remark': remark
      };
    });
    const ws = XLSX.utils.json_to_sheet(allRows, { header: headers });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(workbook, ws, 'Daily Order Plan');
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Takeo_Daily_Plan_Order_${orderDay}_${dateStr}.xlsx`;
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

  let text = `📦 *តារាងបញ្ជាទិញទំនិញ (Store Takeo Daily Plan)*\n`;
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
    text += `   🔢 ចំនួនកុម្ម៉ង់ [${orderDay}]: *${item.orderQuantity} ${item.product.unit}*\n`;
    if (remark) text += `   🚚 ${remark}\n`;
  });

  text += `------------------------------------\n`;
  text += `📊 សរុបមុខទំនិញ: ${filteredItems.length} មុខ\n`;
  text += `📦 សរុបចំនួនទិញ: ${totalQty}\n`;
  if (totalCost > 0) {
    text += `💰 សរុបទឹកប្រាក់: *$${totalCost.toFixed(2)}*\n`;
  }
  text += `\n_បង្កើតដោយប្រព័ន្ធ Mart Scan & Order Takeo_`;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};
