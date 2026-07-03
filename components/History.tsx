
import React, { useState, useMemo } from 'react';
import { Sale, Product, Category } from '../types';
import { History as HistoryIcon, Search, Calendar, Trash2, ChevronRight, X, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveProduct, deleteSaleObj } from '../supabaseService';

interface HistoryProps {
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}

const History: React.FC<HistoryProps> = ({ sales, setSales, products, setProducts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRangeType, setDateRangeType] = useState<'ALL' | 'TODAY' | '7_DAYS' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'SALES' | 'CREDIT'>('ALL');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const filteredSales = useMemo(() => {
    const today = new Date();
    // Set hours to start/end of day for precise comparisons in local timezone
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);

    return sales.filter(s => {
      // 1. Text Search (matches ID, Client Name, OR any Product/Item Name included in the sale)
      const matchesText = 
        s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.clientName && s.clientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        s.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

      // 2. Date Range Search
      const saleDate = new Date(s.date);
      let matchesDate = true;

      if (dateRangeType === 'TODAY') {
        matchesDate = saleDate >= startOfToday && saleDate <= endOfToday;
      } else if (dateRangeType === '7_DAYS') {
        matchesDate = saleDate >= sevenDaysAgo;
      } else if (dateRangeType === 'THIS_MONTH') {
        matchesDate = saleDate >= startOfThisMonth;
      } else if (dateRangeType === 'CUSTOM') {
        if (customStartDate) {
          const start = new Date(customStartDate + 'T00:00:00');
          matchesDate = matchesDate && saleDate >= start;
        }
        if (customEndDate) {
          const end = new Date(customEndDate + 'T23:59:59');
          matchesDate = matchesDate && saleDate <= end;
        }
      }

      // 3. Category Filter
      const matchesCategory = 
        selectedCategory === 'ALL' ||
        s.items.some(item => item.category === selectedCategory);

      // 4. Payment Method Filter
      const matchesPayment = 
        paymentFilter === 'ALL' ||
        (paymentFilter === 'CREDIT' && s.paymentMethod === 'Crédito') ||
        (paymentFilter === 'SALES' && s.paymentMethod !== 'Crédito');

      return matchesText && matchesDate && matchesCategory && matchesPayment;
    });
  }, [sales, searchTerm, dateRangeType, customStartDate, customEndDate, selectedCategory, paymentFilter]);

  const handleDelete = async (sale: Sale) => {
    if (window.confirm('¿Anular esta venta? El stock será devuelto.')) {
      try {
        // 1. Return stock in Supabase
        for (const item of sale.items) {
          const p = products.find(prod => prod.id === item.id);
          if (p) {
            await saveProduct({ ...p, stock: p.stock + item.quantity });
          }
        }

        // 2. Delete sale & credit from Supabase
        await deleteSaleObj(sale.id);

        // 3. Update local UI state
        setProducts(prev => prev.map(p => {
          const item = sale.items.find(i => i.id === p.id);
          return item ? { ...p, stock: p.stock + item.quantity } : p;
        }));

        setSales(prev => prev.filter(s => s.id !== sale.id));
        setSelectedSale(null);
      } catch (err) {
        console.error('Error voiding sale:', err);
        alert('Error al anular la venta en base de datos.');
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-brand-dark flex items-center gap-3">
             Historial de Ventas <HistoryIcon className="text-brand-primary" size={32} />
          </h2>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Registros completos</p>
        </div>

        <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-white flex items-center gap-6 min-w-[200px]">
           <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary">
              <Calendar size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Ventas</p>
              <div className="text-2xl font-black text-brand-dark">{sales.length}</div>
           </div>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border-4 border-white shadow-xl space-y-6">
         {/* Top Row: Search text */}
         <div className="relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary/40 w-5 h-5 group-focus-within:text-brand-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar ID, Cliente o Producto..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-14 pr-8 py-4 rounded-[1.8rem] bg-brand-bg font-black text-slate-700 outline-none text-sm placeholder:text-slate-300 border-2 border-transparent focus:border-brand-primary" 
            />
         </div>

         {/* Filter Options Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Column 1: Date Range Options */}
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block pl-1">Rango de Fecha</label>
               <div className="flex flex-wrap gap-1 p-1 bg-brand-bg rounded-[1.5rem]">
                  {(['ALL', 'TODAY', '7_DAYS', 'THIS_MONTH', 'CUSTOM'] as const).map((type) => {
                     const labels = {
                        ALL: 'Todo',
                        TODAY: 'Hoy',
                        '7_DAYS': '7 Días',
                        THIS_MONTH: 'Este Mes',
                        CUSTOM: 'Rango'
                     };
                     return (
                        <button
                           key={type}
                           type="button"
                           onClick={() => setDateRangeType(type)}
                           className={`flex-1 py-2.5 rounded-[1.2rem] text-[9px] font-black uppercase tracking-wider transition-all text-center ${dateRangeType === type ? 'bg-brand-dark text-white shadow-md' : 'text-slate-400 hover:text-slate-700'}`}
                        >
                           {labels[type]}
                        </button>
                     );
                  })}
               </div>
            </div>

            {/* Column 2: Category Dropdown */}
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block pl-1">Categoría de Producto</label>
               <div className="relative flex items-center bg-brand-bg rounded-[1.5rem] px-4 py-1.5 border-2 border-transparent focus-within:border-brand-primary h-[44px]">
                  <select
                     value={selectedCategory}
                     onChange={e => setSelectedCategory(e.target.value)}
                     className="w-full bg-transparent font-black text-slate-700 outline-none text-xs cursor-pointer appearance-none pr-6"
                  >
                     <option value="ALL">Todas las Categorías</option>
                     {Object.values(Category).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                     ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</div>
               </div>
            </div>

            {/* Column 3: Payment Type */}
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block pl-1">Tipo de Pago</label>
               <div className="flex gap-1 p-1 bg-brand-bg rounded-[1.5rem] h-[44px] items-center">
                  <button 
                    type="button"
                    onClick={() => setPaymentFilter('ALL')}
                    className={`flex-1 py-2 rounded-[1.2rem] text-[9px] font-black uppercase tracking-wider transition-all ${paymentFilter === 'ALL' ? 'bg-brand-dark text-white shadow-md' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    Todos
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPaymentFilter('SALES')}
                    className={`flex-1 py-2 rounded-[1.2rem] text-[9px] font-black uppercase tracking-wider transition-all ${paymentFilter === 'SALES' ? 'bg-brand-dark text-white shadow-md' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    Ventas
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPaymentFilter('CREDIT')}
                    className={`flex-1 py-2 rounded-[1.2rem] text-[9px] font-black uppercase tracking-wider transition-all ${paymentFilter === 'CREDIT' ? 'bg-brand-dark text-white shadow-md' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    Fiados
                  </button>
               </div>
            </div>
         </div>

         {/* Custom Date Inputs Container */}
         <AnimatePresence>
            {dateRangeType === 'CUSTOM' && (
               <motion.div 
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: 'auto' }}
                 exit={{ opacity: 0, height: 0 }}
                 className="flex flex-col sm:flex-row items-center gap-4 bg-brand-bg/50 p-4 rounded-[1.5rem] overflow-hidden"
               >
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.15em] block sm:inline shrink-0">Rango Personalizado:</span>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                     <div className="flex items-center bg-white px-3 py-1.5 rounded-xl border border-purple-100/50 w-full sm:w-auto">
                        <span className="text-[10px] font-black text-slate-400 uppercase mr-2 shrink-0">Desde:</span>
                        <input 
                          type="date" 
                          value={customStartDate} 
                          onChange={e => setCustomStartDate(e.target.value)} 
                          className="bg-transparent font-black text-slate-700 outline-none text-xs w-full sm:w-auto" 
                        />
                     </div>
                     <span className="text-xs font-black text-slate-400 shrink-0">a</span>
                     <div className="flex items-center bg-white px-3 py-1.5 rounded-xl border border-purple-100/50 w-full sm:w-auto">
                        <span className="text-[10px] font-black text-slate-400 uppercase mr-2 shrink-0">Hasta:</span>
                        <input 
                          type="date" 
                          value={customEndDate} 
                          onChange={e => setCustomEndDate(e.target.value)} 
                          className="bg-transparent font-black text-slate-700 outline-none text-xs w-full sm:w-auto" 
                        />
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {filteredSales.length === 0 ? (
          <div className="col-span-full py-24 text-center opacity-30">
            <HistoryIcon size={64} className="mx-auto mb-4" />
            <p className="font-black uppercase tracking-widest text-xs">No hay ventas registradas que coincidan</p>
          </div>
        ) : (
          filteredSales.map((sale, idx) => (
            <motion.div 
              layout
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              transition={{ delay: idx * 0.05 }}
              key={sale.id} 
              className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 pr-10 md:p-8 pr-10 border-4 border-white shadow-xl shadow-purple-50 group hover:shadow-purple-200 transition-all cursor-pointer relative flex flex-col justify-between h-full"
              onClick={() => setSelectedSale(sale)}
            >
               <div>
                  <div className="flex justify-between items-start mb-4">
                     <div className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest">#{sale.id.slice(0,8)}</div>
                     <div className="flex flex-col items-end gap-1">
                        <div className={`px-2 md:px-3 py-1 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest ${sale.paymentMethod === 'Crédito' ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-600'}`}>
                          {sale.paymentMethod}
                        </div>
                        {sale.reference && (
                          <span className="text-[7px] md:text-[8px] font-mono font-black bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            Ref: {sale.reference}
                          </span>
                        )}
                     </div>
                  </div>

                  {sale.clientName && (
                     <div className="text-xs font-bold text-slate-600 uppercase mb-1">
                        Cliente: <span className="font-black text-brand-dark">{sale.clientName}</span>
                     </div>
                  )}

                  <div className="text-xl md:text-2xl font-black text-slate-800 mb-1">${sale.totalUsd.toFixed(2)}</div>
                  <div className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    {new Date(sale.date).toLocaleString()}
                  </div>

                  {/* List of included products - requested to easily see what products are included */}
                  <div className="space-y-1 my-3 bg-brand-bg/40 p-3 rounded-xl border border-dashed border-purple-100/40">
                     <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">Productos:</div>
                     <div className="space-y-1">
                        {sale.items.map((item, i) => (
                           <div key={i} className="text-[10px] text-slate-600 font-extrabold flex justify-between">
                              <span className="truncate max-w-[150px]">{item.quantity}x {item.name}</span>
                              <span className="text-brand-dark font-black">${(item.quantity * item.priceUsd).toFixed(1)}</span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>

                <div className="mt-4 md:mt-6 flex items-center justify-between pt-3 border-t border-purple-50">
                   <div className="flex -space-x-2">
                      {sale.items.slice(0, 3).map((item, i) => (
                         <div key={i} className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-brand-bg border-2 border-white flex items-center justify-center text-[8px] md:text-[10px] font-black text-brand-primary">
                            {item.name.charAt(0)}
                         </div>
                      ))}
                      {sale.items.length > 3 && (
                         <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] md:text-[10px] font-black text-slate-400">
                            +{sale.items.length - 3}
                         </div>
                      )}
                   </div>
                   <ChevronRight size={18} className="text-slate-300 group-hover:text-brand-primary group-hover:translate-x-1 transition-all" />
                </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {selectedSale && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedSale(null)} className="absolute inset-0 bg-brand-dark/40 backdrop-blur-md" />
             <motion.div initial={{ scale: 0.9, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 40 }} className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 bg-brand-dark text-white flex justify-between items-center shrink-0">
                   <div>
                      <h3 className="text-xl font-black uppercase tracking-widest">Venta #{selectedSale.id.slice(0,8)}</h3>
                      <p className="text-[10px] text-purple-200 font-bold uppercase tracking-widest mt-1">{new Date(selectedSale.date).toLocaleString()}</p>
                   </div>
                   <button onClick={() => setSelectedSale(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"><X size={24} /></button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8 flex-1">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-brand-bg/50 p-6 rounded-[2rem]">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Método</p>
                         <p className="text-sm font-black text-brand-dark">{selectedSale.paymentMethod}</p>
                         {selectedSale.reference && (
                            <p className="text-[10px] font-mono font-black text-brand-primary mt-1">Ref: {selectedSale.reference}</p>
                         )}
                      </div>
                      <div className="bg-brand-bg/50 p-6 rounded-[2rem]">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tasa</p>
                         <p className="text-sm font-black text-brand-dark">Bs. {selectedSale.exchangeRate}</p>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-bg pb-2">Artículos</h4>
                      <div className="space-y-3">
                         {selectedSale.items.map((item, i) => (
                            <div key={i} className="flex items-center gap-4 group">
                               <div className="w-12 h-12 bg-brand-bg rounded-2xl flex items-center justify-center text-brand-primary shrink-0"><Package size={20} /></div>
                               <div className="flex-1">
                                  <p className="text-sm font-black text-slate-700 leading-tight">{item.name}</p>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">{item.quantity} unidades x ${item.priceUsd}</p>
                               </div>
                               <div className="text-sm font-black text-brand-dark">${(item.quantity * item.priceUsd).toFixed(2)}</div>
                            </div>
                         ))}
                      </div>
                   </div>

                   <div className="pt-6 border-t border-brand-bg space-y-2">
                       <div className="flex justify-between items-center text-slate-400">
                          <span className="text-[10px] font-black uppercase tracking-widest">Subtotal</span>
                          <span className="font-black">${selectedSale.totalUsd.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase tracking-widest text-brand-primary">Total Pagado</span>
                          <span className="text-3xl font-black text-brand-dark">${selectedSale.totalUsd.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between items-center pt-2 text-[10px] font-bold text-slate-400 uppercase">
                          <span>Equivalente</span>
                          <span>Bs. {(selectedSale.totalUsd * selectedSale.exchangeRate).toFixed(2)}</span>
                       </div>
                   </div>
                </div>

                <div className="p-8 bg-brand-bg/30 border-t border-brand-bg shrink-0">
                   <button 
                     onClick={() => handleDelete(selectedSale)}
                     className="w-full py-5 bg-red-50 text-red-500 font-black rounded-3xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-[10px] shadow-sm"
                   >
                     <Trash2 size={20} /> Anular Venta y Devolver Stock
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default History;
