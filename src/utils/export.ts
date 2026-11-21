import * as XLSX from 'xlsx-js-style';
import { RestockItem } from '../types';

export type OrderDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

// Golden Yellow Header Style matching Takeo Daily Plan exactly (#FFC000)
const TAKEO_HEADER_STYLE = {
  fill: {
    fgColor: { rgb: 'FFC000' },
    patternType: 'solid'
  },
  font: {
    name: 'Calibri',
    sz: 11,
    bold: true,
    color: { rgb: '000000' }
  },
  alignment: {
    vertical: 'center',
    horizontal: 'center',
    wrapText: true
  },
  border: {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } }
  }
};

const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'D9D9D9' } },
  bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
  left: { style: 'thin', color: { rgb: 'D9D9D9' } },
  right: { style: 'thin', color: { rgb: 'D9D9D9' } }
};

const BORDER_SUBTOTAL = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'double', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } }
};

// Vendor badge style helper matching Takeo Store coloring
const getVendorBadgeStyle = (vendor: string) => {
  const v = (vendor || '').trim().toUpperCase();
  if (v === 'MF') {
    return {
      fill: { fgColor: { rgb: 'FF0000' }, patternType: 'solid' },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { vertical: 'center', horizontal: 'center' },
      border: BORDER_THIN
    };
  }
  if (v === 'SM') {
    return {
      fill: { fgColor: { rgb: 'C5E0B4' }, patternType: 'solid' },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { vertical: 'center', horizontal: 'center' },
      border: BORDER_THIN
    };
  }
  if (v === 'NINJA') {
    return {
      fill: { fgColor: { rgb: 'F8CBAD' }, patternType: 'solid' },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { vertical: 'center', horizontal: 'center' },
      border: BORDER_THIN
    };
  }
  if (v === 'W&M') {
    return {
      fill: { fgColor: { rgb: 'FFE699' }, patternType: 'solid' },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { vertical: 'center', horizontal: 'center' },
      border: BORDER_THIN
    };
  }
  if (v.startsWith('FF')) {
    return {
      fill: { fgColor: { rgb: 'DEEBF7' }, patternType: 'solid' },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { vertical: 'center', horizontal: 'center' },
      border: BORDER_THIN
    };
  }
  return {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
    alignment: { vertical: 'center', horizontal: 'center' },
    border: BORDER_THIN
  };
};

/**
 * Apply full Takeo store styles to a 14-column Department Worksheet
 */
const styleDepartmentWorksheet = (ws: any, hasSubtotal: boolean = true) => {
  if (!ws || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  const rowHeights = [{ hpt: 37, hpx: 37 }];
  for (let r = 1; r <= range.e.r; r++) {
    rowHeights.push({
      hpt: (hasSubtotal && r === range.e.r) ? 22 : 20,
      hpx: (hasSubtotal && r === range.e.r) ? 22 : 20
    });
  }
  ws['!rows'] = rowHeights;
  ws['!autofilter'] = { ref: ws['!ref'] };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    const isHeader = R === 0;
    const isSubtotal = hasSubtotal && R === range.e.r;

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { t: 's', v: '' };
      }
      const cell = ws[cellAddress];

      if (isHeader) {
        cell.s = TAKEO_HEADER_STYLE;
      } else if (isSubtotal) {
        const isQtyCol = C >= 6 && C <= 12; // Mon..Sun
        cell.s = {
          fill: { fgColor: { rgb: isQtyCol && cell.v ? 'C5E0B4' : 'F2F2F2' }, patternType: 'solid' },
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
          alignment: {
            vertical: 'center',
            horizontal: C === 2 ? 'left' : (isQtyCol ? 'center' : 'left'),
            wrapText: true
          },
          border: BORDER_SUBTOTAL
        };
      } else {
        // Data row
        // C: 0=Storage Temp, 1=Item Code, 2=Name, 3=Khmer Name, 4=Vendor, 5=Purchase UoM, 6..12=Mon..Sun, 13=Remark
        if (C === 4) {
          cell.s = getVendorBadgeStyle(cell.v);
        } else if (C >= 6 && C <= 12) {
          const hasQty = cell.v !== undefined && cell.v !== null && cell.v !== '' && Number(cell.v) > 0;
          cell.s = {
            fill: hasQty ? { fgColor: { rgb: 'C5E0B4' }, patternType: 'solid' } : undefined,
            font: { name: 'Calibri', sz: 11, bold: hasQty, color: { rgb: hasQty ? '002060' : '000000' } },
            alignment: { vertical: 'center', horizontal: 'center' },
            border: BORDER_THIN
          };
        } else if (C === 0 || C === 1 || C === 5) {
          cell.s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center', horizontal: 'center' },
            border: BORDER_THIN
          };
        } else {
          cell.s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
            border: BORDER_THIN
          };
        }
      }
    }
  }
};

/**
 * Apply styling to the PO Summary Worksheet
 */
const styleSummaryWorksheet = (ws: any, hasGrandTotal: boolean = true) => {
  if (!ws || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  const rowHeights = [{ hpt: 37, hpx: 37 }];
  for (let r = 1; r <= range.e.r; r++) {
    rowHeights.push({
      hpt: (hasGrandTotal && r === range.e.r) ? 22 : 20,
      hpx: (hasGrandTotal && r === range.e.r) ? 22 : 20
    });
  }
  ws['!rows'] = rowHeights;
  ws['!autofilter'] = { ref: ws['!ref'] };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    const isHeader = R === 0;
    const isTotal = hasGrandTotal && R === range.e.r;

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { t: 's', v: '' };
      }
      const cell = ws[cellAddress];

      if (isHeader) {
        cell.s = TAKEO_HEADER_STYLE;
      } else if (isTotal) {
        const isQtyCol = C === 7; // ចំនួនត្រូវទិញ (Order Qty)
        cell.s = {
          fill: { fgColor: { rgb: isQtyCol ? 'C5E0B4' : 'F2F2F2' }, patternType: 'solid' },
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
          alignment: {
            vertical: 'center',
            horizontal: (C === 2 || C === 3) ? 'left' : 'center',
            wrapText: true
          },
          border: BORDER_SUBTOTAL
        };
      } else {
        // Data row
        // C: 0=No, 1=Barcode, 2=Name, 3=Khmer Name, 4=Dept, 5=Vendor, 6=Unit, 7=Order Qty, 8=Order Day, 9=Remark
        if (C === 5) {
          cell.s = getVendorBadgeStyle(cell.v);
        } else if (C === 7) {
          cell.s = {
            fill: { fgColor: { rgb: 'C5E0B4' }, patternType: 'solid' },
            font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '002060' } },
            alignment: { vertical: 'center', horizontal: 'center' },
            border: BORDER_THIN
          };
        } else if (C === 0 || C === 1 || C === 4 || C === 6 || C === 8) {
          cell.s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center', horizontal: 'center' },
            border: BORDER_THIN
          };
        } else {
          cell.s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
            border: BORDER_THIN
          };
        }
      }
    }
  }
};

/**
 * Apply styling to Simple PO Worksheet
 */
const styleSimplePOWorksheet = (ws: any, hasGrandTotal: boolean = true) => {
  if (!ws || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  const rowHeights = [{ hpt: 37, hpx: 37 }];
  for (let r = 1; r <= range.e.r; r++) {
    rowHeights.push({
      hpt: (hasGrandTotal && r === range.e.r) ? 22 : 20,
      hpx: (hasGrandTotal && r === range.e.r) ? 22 : 20
    });
  }
  ws['!rows'] = rowHeights;
  ws['!autofilter'] = { ref: ws['!ref'] };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    const isHeader = R === 0;
    const isTotal = hasGrandTotal && R === range.e.r;

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { t: 's', v: '' };
      }
      const cell = ws[cellAddress];

      if (isHeader) {
        cell.s = TAKEO_HEADER_STYLE;
      } else if (isTotal) {
        const isQtyCol = C === 6; // ចំនួនត្រូវទិញ (Order Qty)
        cell.s = {
          fill: { fgColor: { rgb: isQtyCol ? 'C5E0B4' : 'F2F2F2' }, patternType: 'solid' },
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
          alignment: {
            vertical: 'center',
            horizontal: (C === 2 || C === 3) ? 'left' : 'center',
            wrapText: true
          },
          border: BORDER_SUBTOTAL
        };
      } else {
        // Data row
        // C: 0=No, 1=Barcode, 2=Name, 3=Khmer Name, 4=Cat, 5=Unit, 6=Order Qty, 7=Supplier, 8=Phone, 9=Time
        if (C === 6) {
          cell.s = {
            fill: { fgColor: { rgb: 'C5E0B4' }, patternType: 'solid' },
            font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '002060' } },
            alignment: { vertical: 'center', horizontal: 'center' },
            border: BORDER_THIN
          };
        } else if (C === 0 || C === 1 || C === 5 || C === 8 || C === 9) {
          cell.s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center', horizontal: 'center' },
            border: BORDER_THIN
          };
        } else {
          cell.s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
            border: BORDER_THIN
          };
        }
      }
    }
  }
};

// Helper to determine today's day of week
export const getCurrentDayOfWeek = (): OrderDay => {
  const dayIndex = new Date().getDay(); // 0 is Sun, 1 is Mon, etc.
  const days: OrderDay[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex] || 'Thu';
};

// Helper to determine storage temperature from category, product name, or explicit property
const extractStorageTemp = (category: string, prodName?: string, explicitTemp?: string): string => {
  if (explicitTemp && ['Dry', 'Chilled', 'Frozen'].includes(explicitTemp)) {
    return explicitTemp;
  }
  const cat = (category || '').toLowerCase();
  // 1. Explicit temperature in category string e.g. "Daily (Dry)", "Fresh (Chilled)", "(Frozen)"
  if (cat.includes('(dry)') || cat.includes('dry') || cat.includes('ស្ងួត') || cat.includes('ក្រៀម')) return 'Dry';
  if (cat.includes('(chilled)') || cat.includes('chilled') || cat.includes('ត្រជាក់')) return 'Chilled';
  if (cat.includes('(frozen)') || cat.includes('frozen') || cat.includes('កក')) return 'Frozen';

  // 2. Fallback heuristic from product name only if category had no temperature info
  const name = (prodName || '').toLowerCase();
  if (name.includes('frozen') || name.includes('កក')) return 'Frozen';
  if (name.includes('chilled') || name.includes('ត្រជាក់') || name.includes('ទឹកដោះគោ') || name.includes('dairy') || name.includes('milk') || name.includes('yogurt')) return 'Chilled';

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
const parseVendorAndRemark = (supplierName: string): { vendor: string; remark: string } => {
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
 * Internal Builder: Generates the full Takeo Daily Plan Workbook
 */
export const buildDailyPlanWorkbook = (
  items: RestockItem[], 
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): {
  workbook: XLSX.WorkBook;
  filename: string;
  totalItems: number;
  totalQty: number;
  filteredItems: RestockItem[];
} | null => {
  if (items.length === 0) return null;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
    : items;

  if (filteredItems.length === 0) return null;

  // Exact Daily Plan Columns matching Takeo Store format: 14 columns
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
    { wch: 38 }, // Name
    { wch: 30 }, // Name in Khmer
    { wch: 18 }, // Vendors/Vendor
    { wch: 14 }, // Purchase UoM
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
    const temp = extractStorageTemp(item.product.category, item.product.name, item.product.storageTemp);
    const sheet = extractSheetName(item.product.category);
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    const finalRemark = item.product.remark || remark;

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
      'Remark': finalRemark
    };

    if (sheetsData[sheet]) {
      sheetsData[sheet].push(row);
    } else {
      sheetsData['Daily'].push(row);
    }
  });

  const workbook = XLSX.utils.book_new();

  // 1. ADD DEPARTMENT SHEETS FIRST (matching Store Daily Plan layout: 'Daily' is Sheet 1)
  const sheetOrder = ['Daily', 'Bakery and Cake', 'Fresh', ' Milk and Yogurt'];
  for (const sheetName of sheetOrder) {
    const rows = sheetsData[sheetName] || [];
    if (rows.length > 0) {
      // Add sheet subtotal row
      const sheetQty = rows.reduce((acc, r) => acc + (parseInt(r[orderDay], 10) || 0), 0);

      const rowsWithSubtotal = [
        ...rows,
        {
          'Storage Temperature': '',
          'Item Code': '',
          'Name': `សរុបផ្នែក ${sheetName.trim()} (${rows.length} មុខ)`,
          'Name in Khmer': '',
          'Vendors/Vendor': '',
          'Purchase UoM': '',
          'Mon': orderDay === 'Mon' ? sheetQty : '',
          'Tue': orderDay === 'Tue' ? sheetQty : '',
          'Wed': orderDay === 'Wed' ? sheetQty : '',
          'Thu': orderDay === 'Thu' ? sheetQty : '',
          'Fri': orderDay === 'Fri' ? sheetQty : '',
          'Sat': orderDay === 'Sat' ? sheetQty : '',
          'Sun': orderDay === 'Sun' ? sheetQty : '',
          'Remark': ''
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rowsWithSubtotal, { header: headers });
      ws['!cols'] = colWidths;
      styleDepartmentWorksheet(ws, true);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    } else {
      // Keep sheet with headers so all department tabs exist in template
      const ws = XLSX.utils.json_to_sheet([], { header: headers });
      ws['!cols'] = colWidths;
      styleDepartmentWorksheet(ws, false);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    }
  }

  // 2. ADD SUMMARY SHEET AS SHEET 5: All ordered products in one clean sheet
  const summaryHeaders = [
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
    const finalRemark = item.product.remark || remark;
    return {
      'ល.រ': idx + 1,
      'កូដទំនិញ (Barcode)': item.product.barcode,
      'ឈ្មោះទំនិញ (Product Name)': item.product.name,
      'ឈ្មោះខ្មែរ (Khmer Name)': item.product.khmerName || '',
      'ផ្នែក (Department)': extractSheetName(item.product.category).trim(),
      'អ្នកផ្គត់ផ្គង់ (Vendor)': vendor,
      'ឯកតា (Unit)': item.product.unit || 'Units',
      'ចំនួនត្រូវទិញ (Order Qty)': item.orderQuantity,
      'ថ្ងៃកុម្ម៉ង់ (Order Day)': orderDay,
      'Remark': finalRemark
    };
  });

  // Add Grand Total row to summary sheet
  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  summaryRows.push({
    'ល.រ': '',
    'កូដទំនិញ (Barcode)': '',
    'ឈ្មោះទំនិញ (Product Name)': 'សរុបរួមទាំងអស់ (GRAND TOTAL)',
    'ឈ្មោះខ្មែរ (Khmer Name)': `${filteredItems.length} មុខទំនិញ`,
    'ផ្នែក (Department)': '',
    'អ្នកផ្គត់ផ្គង់ (Vendor)': '',
    'ឯកតា (Unit)': '',
    'ចំនួនត្រូវទិញ (Order Qty)': totalQty,
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
    { wch: 14 }, // Order Day
    { wch: 24 }  // Remark
  ];
  styleSummaryWorksheet(wsSummary, true);
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'បញ្ជីទិញសរុប (PO Summary)');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Daily_Order_Plan_${orderDay}_${dateStr}.xlsx`;

  return {
    workbook,
    filename,
    totalItems: filteredItems.length,
    totalQty,
    filteredItems
  };
};

/**
 * Main Export: Save Store Daily Plan Excel file to browser download
 */
export const exportDailyPlanExcel = (
  items: RestockItem[], 
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): boolean => {
  const plan = buildDailyPlanWorkbook(items, orderDay, supplierFilter);
  if (!plan) return false;
  XLSX.writeFile(plan.workbook, plan.filename);
  return true;
};

/**
 * Generate Excel base64 data for sending directly via Telegram Bot
 */
export const exportDailyPlanExcelBase64 = (
  items: RestockItem[], 
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): {
  base64: string;
  filename: string;
  totalItems: number;
  totalQty: number;
} | null => {
  const plan = buildDailyPlanWorkbook(items, orderDay, supplierFilter);
  if (!plan) return null;

  const base64 = XLSX.write(plan.workbook, { bookType: 'xlsx', type: 'base64' });
  return {
    base64,
    filename: plan.filename,
    totalItems: plan.totalItems,
    totalQty: plan.totalQty
  };
};

// Alias for backwards compatibility
export const exportToTakeoPlanExcel = exportDailyPlanExcel;

/**
 * Generate both Telegram HTML message and plain text summary
 */
export const generateTelegramOrderContent = (
  items: RestockItem[],
  orderDay: OrderDay = getCurrentDayOfWeek(),
  supplierFilter?: string
): {
  html: string;
  plainText: string;
  totalItems: number;
  totalQty: number;
} => {
  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
    : items;

  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  let dateStr = '';
  try {
    dateStr = new Date().toLocaleDateString('km-KH');
  } catch {
    dateStr = new Date().toLocaleDateString();
  }

  const escapeHtml = (str?: string) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();

  const cleanMd = (str?: string) => (str || '').replace(/[*_`]/g, ' ').trim();

  // 1. Build HTML version (for Telegram Bot sendMessage)
  let html = `📦 <b>តារាងបញ្ជាទិញទំនិញ (Daily Order Plan)</b>\n`;
  html += `📅 កាលបរិច្ឆេទ: <b>${escapeHtml(dateStr)}</b> (ថ្ងៃ <b>${orderDay}</b>)\n`;
  if (supplierFilter && supplierFilter !== 'all') {
    html += `🏢 អ្នកផ្គត់ផ្គង់: <b>${escapeHtml(supplierFilter)}</b>\n`;
  }
  html += `━━━━━━━━━━━━━━━━━━━━\n`;

  // 2. Build Plain Text version (for clipboard / fallback)
  let text = `📦 *តារាងបញ្ជាទិញទំនិញ (Daily Order Plan)*\n`;
  text += `📅 កាលបរិច្ឆេទ: ${dateStr} (ថ្ងៃ ${orderDay})\n`;
  if (supplierFilter && supplierFilter !== 'all') {
    text += `🏢 អ្នកផ្គត់ផ្គង់: *${cleanMd(supplierFilter)}*\n`;
  }
  text += `------------------------------------\n`;

  filteredItems.forEach((item, idx) => {
    const { vendor, remark } = parseVendorAndRemark(item.product.supplierName);
    const finalRemark = item.product.remark || remark;

    const hName = escapeHtml(item.product.name);
    const hKhmer = escapeHtml(item.product.khmerName);
    const hCode = escapeHtml(item.product.barcode);
    const hVendor = escapeHtml(vendor);
    const hUnit = escapeHtml(item.product.unit || 'Units');
    const hRemark = escapeHtml(finalRemark);

    const mName = cleanMd(item.product.name);
    const mKhmer = cleanMd(item.product.khmerName);
    const mCode = cleanMd(item.product.barcode);
    const mVendor = cleanMd(vendor);
    const mUnit = cleanMd(item.product.unit || 'Units');
    const mRemark = cleanMd(finalRemark);

    // HTML Item block
    html += `<b>${idx + 1}. ${hName}</b>\n`;
    if (hKhmer) html += `   <i>(${hKhmer})</i>\n`;
    html += `   🏷 Code: <code>${hCode}</code> | Vendor: <b>${hVendor}</b>\n`;
    html += `   🔢 ចំនួនត្រូវទិញ: <b>${item.orderQuantity}</b> ${hUnit}\n`;
    if (hRemark) html += `   🚚 <i>${hRemark}</i>\n`;
    html += `\n`;

    // Markdown Item block
    text += `${idx + 1}. *${mName}*\n`;
    if (mKhmer) text += `   (${mKhmer})\n`;
    text += `   🏷 Code: \`${mCode}\` | Vendor: ${mVendor}\n`;
    text += `   🔢 ចំនួនត្រូវទិញ [${orderDay}]: *${item.orderQuantity}* ${mUnit}\n`;
    if (mRemark) text += `   🚚 ${mRemark}\n`;
  });

  html += `━━━━━━━━━━━━━━━━━━━━\n`;
  html += `📊 សរុបមុខទំនិញ: <b>${filteredItems.length}</b> មុខ\n`;
  html += `📦 សរុបចំនួនទិញ: <b>${totalQty}</b> ឯកតា\n\n`;
  html += `<i>✨ បាញ់ចេញពីប្រព័ន្ធ Mart Scan & Order</i>`;

  text += `------------------------------------\n`;
  text += `📊 សរុបមុខទំនិញ: ${filteredItems.length} មុខ\n`;
  text += `📦 សរុបចំនួនទិញ: ${totalQty} ឯកតា\n\n`;
  text += `_បង្កើតដោយប្រព័ន្ធ Mart Scan & Order_`;

  return {
    html,
    plainText: text,
    totalItems: filteredItems.length,
    totalQty
  };
};

/**
 * Simple Clean PO Export (Single Sheet)
 */
export const exportToSimplePOExcel = (items: RestockItem[], supplierFilter?: string): boolean => {
  if (items.length === 0) return false;

  const filteredItems = supplierFilter && supplierFilter !== 'all'
    ? items.filter(i => (i.product?.supplierName || 'ទូទៅ (General Supplier)').trim() === supplierFilter.trim())
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
    'អ្នកផ្គត់ផ្គង់ (Supplier)': item.product.supplierName,
    'លេខទូរស័ព្ទ (Phone)': item.product.supplierPhone || '',
    'ម៉ោងស្កេន (Scanned At)': (() => {
      try {
        return item.scannedAt ? new Date(item.scannedAt).toLocaleString('km-KH') : '';
      } catch {
        return item.scannedAt ? new Date(item.scannedAt).toLocaleString() : '';
      }
    })()
  }));

  // Add Grand Total row
  const totalQty = filteredItems.reduce((acc, curr) => acc + (curr.orderQuantity || 0), 0);
  rows.push({
    'ល.រ (No.)': '' as any,
    'បារកូដ (Barcode)': '',
    'ឈ្មោះទំនិញ (Product Name)': 'សរុបរួម (GRAND TOTAL)',
    'ឈ្មោះខ្មែរ (Khmer Name)': `${filteredItems.length} មុខទំនិញ`,
    'ប្រភេទ (Category)': '',
    'ឯកតា (Unit)': '',
    'ចំនួនត្រូវទិញ (Order Qty)': totalQty,
    'អ្នកផ្គត់ផ្គង់ (Supplier)': '',
    'លេខទូរស័ព្ទ (Phone)': '',
    'ម៉ោងស្កេន (Scanned At)': ''
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 8 },  // No
    { wch: 18 }, // Barcode
    { wch: 34 }, // Name
    { wch: 28 }, // Khmer Name
    { wch: 22 }, // Category
    { wch: 10 }, // Unit
    { wch: 22 }, // Order Qty
    { wch: 28 }, // Supplier
    { wch: 16 }, // Phone
    { wch: 20 }, // Time
  ];
  styleSimplePOWorksheet(worksheet, true);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'បញ្ជីទំនិញត្រូវទិញ');

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

  const content = generateTelegramOrderContent(items, orderDay, supplierFilter);
  if (content.totalItems === 0) return false;

  const text = content.plainText;

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
