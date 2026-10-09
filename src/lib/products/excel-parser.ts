import * as xlsx from 'xlsx';

export interface ParsedWardahProduct {
  id: string;
  sku: string;
  name: string;
  odooCode: string;
  sapCode: string;
  barcode: string;
  defaultPrice: number;
  mainCategory: string;
  series: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string;
  routineStep?: string;
  suitableSkinTypes?: string[];
  suitableConcerns?: string[];
}

export interface ParsedWardahCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  mainCategory: string;
  productCount: number;
}

export interface WardahExcelParseResult {
  categories: ParsedWardahCategory[];
  products: ParsedWardahProduct[];
  summary: {
    totalRows: number;
    totalProducts: number;
    totalCategories: number;
    mainCategories: string[];
  };
}

/**
 * Helper to determine category icon based on category name & main category
 */
export function getWardahCategoryIcon(name: string, mainCategory: string): string {
  const n = name.toLowerCase();
  if (n.includes('sunscreen') || n.includes('uv')) return '☀️';
  if (n.includes('acne')) return '🔴';
  if (n.includes('c-defense') || n.includes('vitamin c')) return '🍊';
  if (n.includes('hydra') || n.includes('rose')) return '🌹';
  if (n.includes('lightening') || n.includes('bright')) return '✨';
  if (n.includes('crystal')) return '💎';
  if (n.includes('renew') || n.includes('aging')) return '⏳';
  if (n.includes('lip')) return '💄';
  if (n.includes('eye') || n.includes('eyexpert')) return '👁️';
  if (n.includes('powder') || n.includes('cushion') || n.includes('foundation') || n.includes('face make up')) return '🪞';
  if (n.includes('cleanser') || n.includes('wash') || n.includes('micellar')) return '🧴';
  if (n.includes('hair') || n.includes('shampoo')) return '💇';
  if (n.includes('deodorant')) return '🌿';
  if (n.includes('scentsation') || n.includes('parfum') || n.includes('mist')) return '🌸';
  if (n.includes('spa')) return '🫧';
  if (n.includes('package')) return '🎁';
  if (n.includes('tool') || n.includes('brush') || n.includes('blender')) return '🖌️';
  if (mainCategory === 'DECORATIVE') return '💄';
  if (mainCategory === 'PERSONAL CARE') return '🧼';
  return '✨';
}

/**
 * Helper to generate URL-safe slug from name
 */
export function slugifyWardah(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Infer routine step based on product name
 */
export function inferRoutineStep(name: string): string | undefined {
  const n = name.toLowerCase();
  if (n.includes('sunscreen') || n.includes('spf') || n.includes('uv shield')) return 'protection';
  if (n.includes('cleanser') || n.includes('foam') || n.includes('wash') || n.includes('micellar') || n.includes('balm') || n.includes('scrub')) return 'cleanser';
  if (n.includes('serum') || n.includes('ampoule') || n.includes('essence') || n.includes('treatment') || n.includes('peeling')) return 'treatment';
  if (n.includes('moisturizer') || n.includes('day cream') || n.includes('night cream') || n.includes('gel') || n.includes('lotion')) return 'moisturizer';
  if (n.includes('parfum') || n.includes('body mist') || n.includes('eau de toilette') || n.includes('scentsation')) return 'fragrance';
  if (n.includes('hair') || n.includes('shampoo') || n.includes('conditioner') || n.includes('body')) return 'body_hair';
  return undefined;
}

/**
 * Infer suitable skin types based on series and product name
 */
export function inferSkinTypes(name: string, series: string): string[] {
  const combined = `${name} ${series}`.toLowerCase();
  const types: string[] = [];
  if (combined.includes('acne') || combined.includes('oil control') || combined.includes('matte')) {
    types.push('oily', 'combination');
  }
  if (combined.includes('hydra') || combined.includes('dry') || combined.includes('nourish')) {
    types.push('dry');
  }
  if (combined.includes('calm') || combined.includes('soothe') || combined.includes('sensitive') || combined.includes('low ph')) {
    types.push('sensitive');
  }
  if (combined.includes('lightening') || combined.includes('crystal') || combined.includes('perfect bright')) {
    if (!types.includes('normal')) types.push('normal');
  }
  return types.length > 0 ? types : ['normal'];
}

/**
 * Infer suitable concerns based on series and product name
 */
export function inferSkinConcerns(name: string, series: string): string[] {
  const combined = `${name} ${series}`.toLowerCase();
  const concerns: string[] = [];
  if (combined.includes('acne') || combined.includes('jerawat') || combined.includes('salicylic')) {
    concerns.push('jerawat');
  }
  if (combined.includes('blackhead') || combined.includes('pore') || combined.includes('pori')) {
    concerns.push('komedo_pori');
  }
  if (combined.includes('bright') || combined.includes('lightening') || combined.includes('kusam') || combined.includes('glow') || combined.includes('crystal')) {
    concerns.push('kusam');
  }
  if (combined.includes('oil control') || combined.includes('sebum') || combined.includes('clay')) {
    concerns.push('minyak');
  }
  if (combined.includes('aging') || combined.includes('renew') || combined.includes('wrinkle') || combined.includes('collagen')) {
    concerns.push('penuaan');
  }
  if (combined.includes('hydra') || combined.includes('dehidrasi') || combined.includes('rose')) {
    concerns.push('dehidrasi');
  }
  if (combined.includes('calm') || combined.includes('soothe') || combined.includes('sensitive')) {
    concerns.push('sensitif');
  }
  return concerns;
}

/**
 * Main parser function that handles Wardah Modern Trade Excel Form Order
 */
export function parseWardahOrderExcel(fileData: Buffer | ArrayBuffer | Uint8Array): WardahExcelParseResult {
  const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer(fileData);
  const workbook = xlsx.read(fileData, {
    type: isBuffer ? 'buffer' : 'array',
    cellDates: false,
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
  }

  const rawRows: unknown[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('File Excel kosong.');
  }

  // Find header row (row containing KODE ODOO or SAP CODE or BARCODE or NAMA PRODUK)
  let headerIndex = -1;
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const rowStr = (rawRows[i] || []).map((c) => String(c || '').toUpperCase()).join(' ');
    if (
      (rowStr.includes('KODE ODOO') || rowStr.includes('ODOO')) &&
      (rowStr.includes('NAMA PRODUK') || rowStr.includes('HARGA') || rowStr.includes('SAP CODE'))
    ) {
      headerIndex = i;
      break;
    }
  }

  // If not found, default to row 7 (index 6)
  if (headerIndex === -1) {
    headerIndex = 6;
  }

  let currentMainCategory = 'FACE CARE';
  let currentSeries = '';

  const categoriesMap = new Map<string, ParsedWardahCategory>();
  const products: ParsedWardahProduct[] = [];
  const seenSapCodes = new Set<string>();

  const knownMainCategories = ['FACE CARE', 'DECORATIVE', 'PERSONAL CARE'];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    const c0 = row[0] != null ? String(row[0]).trim() : '';
    const c1 = row[1] != null ? String(row[1]).trim() : '';
    const c2 = row[2] != null ? String(row[2]).trim() : '';
    const c4 = row[4] != null ? String(row[4]).trim() : '';
    const c5 = row[5] != null ? row[5] : null;

    // Detect Category or Series Header Row
    // A header row has a label in column 0, while product columns (c1, c2, c4, c5) are empty
    if (c0 && !c1 && !c2 && !c4 && c5 == null) {
      const upper = c0.toUpperCase();
      if (knownMainCategories.includes(upper)) {
        currentMainCategory = upper;
        currentSeries = '';
      } else {
        currentSeries = c0;
      }
      continue;
    }

    // Detect Product Row: Must have Product Name (c4) and Price (c5)
    if (c4 && c5 != null) {
      const rawPrice = typeof c5 === 'number' ? c5 : parseFloat(String(c5).replace(/[^0-9.]/g, '')) || 0;
      const price = Math.round(rawPrice);

      const odooCode = c0;
      const sapCode = c1;
      const barcode = c2;
      const name = c4;

      // Deduplicate identical duplicate rows in Excel if any
      const uniqueKey = sapCode || odooCode || `${barcode}-${name}`;
      if (seenSapCodes.has(uniqueKey)) {
        continue;
      }
      seenSapCodes.add(uniqueKey);

      // Determine Category Name & Slug
      const categoryName = currentSeries ? currentSeries : currentMainCategory;
      const categorySlug = slugifyWardah(categoryName);
      const categoryId = categorySlug;
      const icon = getWardahCategoryIcon(categoryName, currentMainCategory);

      // Register or update Category
      if (!categoriesMap.has(categoryId)) {
        categoriesMap.set(categoryId, {
          id: categoryId,
          name: categoryName,
          slug: categorySlug,
          icon,
          mainCategory: currentMainCategory,
          productCount: 0,
        });
      }
      categoriesMap.get(categoryId)!.productCount++;

      // Build product document ID: PRD-{sapCode} or PRD-{odooCode} or PRD-{barcode}
      const prodId = sapCode
        ? `PRD-${sapCode}`
        : odooCode
        ? `PRD-${odooCode}`
        : `PRD-${barcode || Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      const sku = sapCode || odooCode || barcode || prodId;

      products.push({
        id: prodId,
        sku,
        name,
        odooCode,
        sapCode,
        barcode,
        defaultPrice: price,
        mainCategory: currentMainCategory,
        series: currentSeries,
        categoryId,
        categoryName,
        categorySlug,
        categoryIcon: icon,
        routineStep: inferRoutineStep(name),
        suitableSkinTypes: inferSkinTypes(name, currentSeries),
        suitableConcerns: inferSkinConcerns(name, currentSeries),
      });
    }
  }

  const categories = Array.from(categoriesMap.values());

  return {
    categories,
    products,
    summary: {
      totalRows: rawRows.length,
      totalProducts: products.length,
      totalCategories: categories.length,
      mainCategories: Array.from(new Set(categories.map((c) => c.mainCategory))),
    },
  };
}
