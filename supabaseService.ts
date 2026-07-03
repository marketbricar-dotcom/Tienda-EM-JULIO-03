import { supabase, isSupabaseConfigured } from './supabase';
import { Product, Sale, Category, PaymentMethod, CartItem, CreditPayment } from './types';
import { INITIAL_RATE } from './constants';

// --- CONFIG (exchange rate) ---
export const getExchangeRate = async (): Promise<number> => {
  if (!isSupabaseConfigured()) {
    const saved = localStorage.getItem('em_rate');
    return saved ? parseFloat(saved) : INITIAL_RATE;
  }

  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'exchange_rate')
      .maybeSingle();

    if (error) {
      console.warn('Note: Could not fetch exchange rate from Supabase. Falling back to local storage. Details:', error.message || error);
      return INITIAL_RATE;
    }

    if (data && data.value) {
      const parsed = parseFloat(data.value);
      return isNaN(parsed) ? INITIAL_RATE : parsed;
    }

    // Default rate if not set yet
    await saveExchangeRate(INITIAL_RATE);
    return INITIAL_RATE;
  } catch (err) {
    console.warn('Failed to get exchange rate from Supabase, using local fallback:', err);
    return INITIAL_RATE;
  }
};

export const saveExchangeRate = async (rate: number): Promise<void> => {
  localStorage.setItem('em_rate', rate.toString());
  if (!isSupabaseConfigured()) return;

  try {
    const { error } = await supabase
      .from('config')
      .upsert({ key: 'exchange_rate', value: rate.toString() }, { onConflict: 'key' });

    if (error) {
      console.warn('Could not save exchange rate to Supabase. Saving locally only. Details:', error.message || error);
    }
  } catch (err) {
    console.warn('Failed to save exchange rate to Supabase, saved locally:', err);
  }
};

export const getStockThreshold = async (): Promise<number> => {
  if (!isSupabaseConfigured()) {
    const saved = localStorage.getItem('em_stock_threshold');
    return saved ? parseInt(saved, 10) : 5;
  }

  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'stock_threshold')
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch stock threshold from Supabase, falling back to local. Details:', error.message || error);
      const saved = localStorage.getItem('em_stock_threshold');
      return saved ? parseInt(saved, 10) : 5;
    }

    if (data && data.value) {
      const parsed = parseInt(data.value, 10);
      return isNaN(parsed) ? 5 : parsed;
    }

    // Default threshold if not set yet
    await saveStockThreshold(5);
    return 5;
  } catch (err) {
    console.warn('Failed to get stock threshold from Supabase, using local fallback:', err);
    const saved = localStorage.getItem('em_stock_threshold');
    return saved ? parseInt(saved, 10) : 5;
  }
};

export const saveStockThreshold = async (threshold: number): Promise<void> => {
  localStorage.setItem('em_stock_threshold', threshold.toString());
  if (!isSupabaseConfigured()) return;

  try {
    const { error } = await supabase
      .from('config')
      .upsert({ key: 'stock_threshold', value: threshold.toString() }, { onConflict: 'key' });

    if (error) {
      console.warn('Could not save stock threshold to Supabase. Saving locally only. Details:', error.message || error);
    }
  } catch (err) {
    console.warn('Failed to save stock threshold to Supabase, saved locally:', err);
  }
};


// --- PRODUCTS (deposit) ---
export const getProducts = async (): Promise<Product[]> => {
  if (!isSupabaseConfigured()) {
    const saved = localStorage.getItem('em_products');
    return saved ? JSON.parse(saved) : [];
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*');

    if (error) {
      console.warn('Could not fetch products from Supabase, using local storage. Details:', error.message || error);
      const saved = localStorage.getItem('em_products');
      return saved ? JSON.parse(saved) : [];
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      category: (row.category || Category.OTROS) as Category,
      barcode: row.barcode || '',
      priceUsd: row.price_usd || 0,
      stock: row.stock || 0,
      subcategory: '',
      size: '',
      costPrice: 0,
      profitPercentage: 0,
      image: ''
    }));
  } catch (err) {
    console.warn('Failed to get products from Supabase, falling back to local storage:', err);
    const saved = localStorage.getItem('em_products');
    return saved ? JSON.parse(saved) : [];
  }
};

export const saveProduct = async (p: Product): Promise<void> => {
  if (!isSupabaseConfigured()) {
    // handled in App.tsx using setProducts state & local storage trigger
    return;
  }

  try {
    const dbPayload = {
      id: p.id,
      name: p.name,
      category: p.category,
      barcode: p.barcode || null,
      price_usd: p.priceUsd,
      stock: p.stock
    };

    const { error } = await supabase
      .from('products')
      .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
       console.warn('Error upserting product to Supabase, falling back to local saving. Details:', error.message || error);
       throw error;
    }
  } catch (err) {
    console.warn('Failed to save product to Supabase:', err);
    throw err;
  }
};

export const deleteProduct = async (id: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;

  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('Error deleting product from Supabase. Details:', error.message || error);
      throw error;
    }
  } catch (err) {
    console.warn('Failed to delete product from Supabase:', err);
    throw err;
  }
};


// --- SALES (caja) & CREDITS (fiados) ---
export const getSalesWithCredits = async (): Promise<{ sales: Sale[], credits: any[] }> => {
  if (!isSupabaseConfigured()) {
    const saved = localStorage.getItem('em_sales');
    return { sales: saved ? JSON.parse(saved) : [], credits: [] };
  }

  try {
    // 1. Fetch sales
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .order('timestamp', { ascending: false });

    if (salesError) {
      console.warn('Could not fetch sales from Supabase. Details:', salesError.message || salesError);
      throw salesError;
    }

    // 2. Fetch credits (direct check)
    const { data: creditsData, error: creditsError } = await supabase
      .from('credits')
      .select('*');

    if (creditsError) {
      console.warn('Could not fetch credits list from Supabase. Details:', creditsError.message || creditsError);
    }

    const mappedSales: Sale[] = (salesData || []).map(row => {
      let parsedItems: CartItem[] = [];
      let mappedPayments: CreditPayment[] = [];
      let isPaidVal = true;
      let crDate = row.timestamp;
      let crAmount = row.total_usd;

      try {
        if (row.items) {
          const parsed = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
          if (Array.isArray(parsed)) {
            parsedItems = parsed;
            isPaidVal = row.payment_method !== PaymentMethod.CREDITO;
          } else if (parsed && parsed.cartItems) {
            parsedItems = parsed.cartItems;
            mappedPayments = parsed.payments || [];
            isPaidVal = parsed.isPaid !== undefined ? parsed.isPaid : (row.payment_method !== PaymentMethod.CREDITO);
            crDate = parsed.creditDate || row.timestamp;
            crAmount = parsed.creditAmount || row.total_usd;
          } else {
            parsedItems = [];
          }
        }
      } catch (e) {
        console.error('Error parsing sales.items for id:', row.id, e);
      }

      return {
        id: row.id,
        date: row.timestamp,
        items: parsedItems,
        totalUsd: row.total_usd,
        exchangeRate: row.rate_at_sale || INITIAL_RATE,
        paymentMethod: row.payment_method as PaymentMethod,
        reference: row.payment_reference || undefined,
        clientName: row.customer_name || undefined,
        creditDate: crDate,
        creditAmount: crAmount,
        isPaid: isPaidVal,
        payments: mappedPayments
      };
    });

    return { sales: mappedSales, credits: creditsData || [] };
  } catch (err) {
    console.warn('Failed to get sales & credits from Supabase, using local fallback:', err);
    const saved = localStorage.getItem('em_sales');
    return { sales: saved ? JSON.parse(saved) : [], credits: [] };
  }
};

export const saveSaleObj = async (sale: Sale): Promise<void> => {
  if (!isSupabaseConfigured()) return;

  try {
    // Clean products image data from the items payload to save storage/bandwidth in DB JSON field,
    // which also complies perfectly with lightweight rows.
    const optimizedCartItems = sale.items.map(item => {
      const { image, ...rest } = item;
      return rest;
    });

    const itemsPayload = {
      cartItems: optimizedCartItems,
      payments: sale.payments || [],
      isPaid: sale.isPaid || false,
      creditDate: sale.creditDate || sale.date,
      creditAmount: sale.creditAmount !== undefined ? sale.creditAmount : sale.totalUsd
    };

    const { error: salesError } = await supabase
      .from('sales')
      .upsert({
        id: sale.id,
        timestamp: sale.date,
        items: JSON.stringify(itemsPayload),
        total_usd: sale.totalUsd,
        total_bsf: sale.totalUsd * sale.exchangeRate,
        rate_at_sale: sale.exchangeRate,
        payment_method: sale.paymentMethod,
        customer_name: sale.clientName || null,
        payment_reference: sale.reference || null
      }, { onConflict: 'id' });

    if (salesError) {
      console.warn('Error upserting sale to Supabase. Details:', salesError.message || salesError);
      throw salesError;
    }

    // Synchronize to credits table
    if (sale.paymentMethod === PaymentMethod.CREDITO && sale.clientName) {
      const totalPaidUsd = (sale.payments || []).reduce((sum, p) => sum + p.amountUsd, 0);
      const totalPaidBs = (sale.payments || []).reduce((sum, p) => sum + p.amountBs, 0);

      const netPendingUsd = Math.max(0, sale.totalUsd - totalPaidUsd);
      const netPendingBs = Math.max(0, (sale.totalUsd * sale.exchangeRate) - totalPaidBs);
      const isFullyPaid = netPendingUsd <= 0.01;

      const { error: creditError } = await supabase
        .from('credits')
        .upsert({
          id: sale.id, // linked precisely to sale row
          customer_name: sale.clientName,
          amount_usd: netPendingUsd,
          amount_bsf: netPendingBs,
          status: isFullyPaid ? 'PAGADO' : 'PENDIENTE'
        }, { onConflict: 'id' });

      if (creditError) {
         console.warn('Could not synchronize credit row to Supabase. Details:', creditError.message || creditError);
      }
    } else {
      // If it WAS a credit row but got changed (de-authorized or deleted), clean up
      await supabase.from('credits').delete().eq('id', sale.id);
    }
  } catch (err) {
    console.warn('Failed in saveSaleObj to Supabase:', err);
    throw err;
  }
};

export const deleteSaleObj = async (id: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;

  try {
    // 1. Delete credit entry if exists
    await supabase.from('credits').delete().eq('id', id);

    // 2. Delete sale record
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('Error deleting sale row from Supabase. Details:', error.message || error);
      throw error;
    }
  } catch (err) {
     console.warn('Failed to delete sale from Supabase:', err);
     throw err;
  }
};
