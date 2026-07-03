import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Package, ShoppingCart, BarChart3, Download, Upload, X, WalletCards, RefreshCcw, Sparkles, DollarSign, Info, History as HistoryIcon, Settings, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Reports from './components/Reports';
import Credits from './components/Credits';
import History from './components/History';
import { Product, Sale } from './types';
import { INITIAL_RATE } from './constants';
import { getExchangeRate, saveExchangeRate, getProducts, getSalesWithCredits, saveProduct, getStockThreshold, saveStockThreshold } from './supabaseService';
import { isSupabaseConfigured } from './supabase';

const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'reports' | 'credits' | 'history'>('inventory');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Application Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(INITIAL_RATE);
  const [stockThreshold, setStockThreshold] = useState<number>(5);

  // Initialize Data from Supabase
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const rate = await getExchangeRate();
        setExchangeRate(rate);

        const threshold = await getStockThreshold();
        setStockThreshold(threshold);

        const prodList = await getProducts();
        setProducts(prodList);

        const { sales: fetchedSales } = await getSalesWithCredits();
        setSales(fetchedSales);
      } catch (err) {
        console.error("Error loading startup data from Supabase:", err);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  const handleRateChange = async (val: number) => {
    const rateVal = isNaN(val) ? 0 : val;
    setExchangeRate(rateVal);
    await saveExchangeRate(rateVal);
  };

  const handleThresholdChange = async (val: number) => {
    const thresholdVal = isNaN(val) ? 0 : val;
    setStockThreshold(thresholdVal);
    await saveStockThreshold(thresholdVal);
  };

  const lowStockCount = useMemo(() => {
    return products.filter(p => p.stock < stockThreshold).length;
  }, [products, stockThreshold]);

  const handleExportData = () => {
    const dataStr = JSON.stringify({ products, sales, exchangeRate, date: new Date().toISOString() }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tienda_cute_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.products && Array.isArray(parsed.products)) {
          if (window.confirm("¿Restaurar respaldo de inventario? Se subirán y sincronizarán los productos en Supabase sin modificar las ventas ni los fiados actuales.")) {
            setIsLoading(true);
            try {
              for (const p of parsed.products) {
                // Ensure correct frontend field casing mapping
                const normalizedProd: Product = {
                  id: p.id || Math.random().toString(36).substring(2, 9),
                  name: p.name || 'Producto sin nombre',
                  priceUsd: typeof p.priceUsd === 'number' ? p.priceUsd : (typeof p.price_usd === 'number' ? p.price_usd : 0),
                  stock: typeof p.stock === 'number' ? p.stock : 0,
                  category: p.category || 'Otros',
                  barcode: p.barcode || '',
                  subcategory: p.subcategory || '',
                  size: p.size || '',
                  costPrice: p.costPrice || 0,
                  profitPercentage: p.profitPercentage || 0,
                  image: ''
                };
                await saveProduct(normalizedProd);
              }
              // Refresh state from Supabase / Local storage setup
              const refreshedProducts = await getProducts();
              setProducts(refreshedProducts);
              alert("🎉 ¡Inventario restaurado y sincronizado con Supabase con éxito!");
              setShowSyncModal(false);
            } catch (saveErr) {
              console.error("Error saving imported products to database:", saveErr);
              alert("Hubo un error al guardar los productos en Supabase.");
            } finally {
              setIsLoading(false);
            }
          }
        } else {
          alert("El archivo no contiene un formato de respaldo de inventario válido (campo 'products' ausente).");
        }
      } catch (err) {
        alert("Archivo de respaldo inválido o dañado.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg relative overflow-hidden select-none pb-24 md:pb-8">
      {/* Decorative Ambient Background Glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-brand-primary/10 via-purple-300/10 to-transparent blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-brand-secondary/10 via-violet-300/10 to-transparent blur-[120px] pointer-events-none" />

      {/* Dynamic Header */}
      <header className="bg-brand-dark text-white shadow-xl shadow-brand-primary/10 sticky top-0 z-50 rounded-b-[1.5rem] md:rounded-b-[2.5rem]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
           <div className="flex items-center gap-3 md:gap-4">
              <motion.div 
                whileHover={{ rotate: 12, scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white p-1.5 md:p-2 rounded-xl md:rounded-2xl shadow-lg shadow-purple-900/30 border-2 border-white/40"
              >
                 <Package size={20} className="text-brand-primary md:w-6 md:h-6" />
              </motion.div>
              <div className="hidden sm:block">
                 <h1 className="text-lg md:text-2xl font-black tracking-tight leading-none uppercase">
                   <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-200 to-white">EM Tienda</span>
                 </h1>
                 <p className="text-[8px] md:text-[10px] text-purple-200/90 font-bold uppercase tracking-[0.2em] mt-0.5">Online Cute ✨</p>
              </div>
           </div>

           {/* Desktop Navigation */}
           <nav className="hidden lg:flex items-center gap-1 bg-white/10 p-1.5 rounded-full border border-white/10 backdrop-blur-md">
              <NavTab variant="header" active={activeTab === 'sales'} icon={ShoppingCart} label="Caja" onClick={() => setActiveTab('sales')} />
              <NavTab variant="header" active={activeTab === 'inventory'} icon={Package} label="Depósito" onClick={() => setActiveTab('inventory')} badgeCount={lowStockCount} />
              <NavTab variant="header" active={activeTab === 'reports'} icon={BarChart3} label="Dash" onClick={() => setActiveTab('reports')} badgeCount={lowStockCount} />
              <NavTab variant="header" active={activeTab === 'history'} icon={HistoryIcon} label="Historial" onClick={() => setActiveTab('history')} />
              <NavTab variant="header" active={activeTab === 'credits'} icon={WalletCards} label="Fiados" onClick={() => setActiveTab('credits')} />
           </nav>

           <div className="flex items-center gap-2 md:gap-4">
              {/* Supabase connection indicator */}
              {isSupabaseConfigured() ? (
                 <div className="flex items-center gap-1.5 bg-emerald-500/15 px-3 py-2 rounded-2xl border border-emerald-500/30 text-emerald-300 backdrop-blur-md shadow-sm shadow-emerald-500/10">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Supabase Conectado</span>
                    <span className="text-[10px] font-black uppercase tracking-wider sm:hidden">Nube</span>
                 </div>
              ) : (
                 <div className="flex items-center gap-1.5 bg-amber-500/15 px-3 py-2 rounded-2xl border border-amber-500/30 text-amber-300 backdrop-blur-md shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Modo Local (Offline)</span>
                    <span className="text-[10px] font-black uppercase tracking-wider sm:hidden">Local</span>
                 </div>
              )}

              {/* Tasa Widget */}
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/10 backdrop-blur-md">
                 <span className="hidden md:inline text-[10px] font-bold text-purple-100 uppercase tracking-widest">Tasa:</span>
                 <div className="flex items-center gap-1 font-black text-brand-yellow">
                    <span className="text-xs">Bs.</span>
                    <input 
                       type="number" 
                       value={exchangeRate} 
                       onChange={e => handleRateChange(parseFloat(e.target.value))}
                       className="w-14 md:w-20 bg-transparent border-none text-center outline-none focus:ring-0"
                    />
                 </div>
              </div>

              {/* Settings button */}
              <button 
                onClick={() => setShowSyncModal(true)}
                className="p-3 bg-brand-primary text-white rounded-2xl transition-all shadow-lg active:scale-95 border border-white/20"
              >
                <Settings size={20} />
              </button>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div 
              key="loader"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32"
            >
               <RefreshCcw className="text-brand-primary animate-spin mb-6" size={64} />
               <p className="text-brand-secondary font-black animate-pulse text-lg uppercase tracking-widest">Abriendo Tienda...</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "circOut" }}
            >
              {activeTab === 'inventory' && <Inventory products={products} setProducts={setProducts} exchangeRate={exchangeRate} />}
              {activeTab === 'sales' && <Sales products={products} setProducts={setProducts} sales={sales} setSales={setSales} exchangeRate={exchangeRate} onViewHistory={() => setActiveTab('history')} />}
              {activeTab === 'reports' && <Reports products={products} sales={sales} exchangeRate={exchangeRate} stockThreshold={stockThreshold} />}
              {activeTab === 'credits' && <Credits sales={sales} setSales={setSales} exchangeRate={exchangeRate} products={products} setProducts={setProducts} />}
              {activeTab === 'history' && <History sales={sales} setSales={setSales} products={products} setProducts={setProducts} />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Bar for Mobile Only */}
      <nav className="lg:hidden fixed bottom-4 left-0 right-0 p-4 z-[100] pointer-events-none">
        <div className="max-w-md mx-auto bg-slate-900/90 backdrop-blur-xl p-2 rounded-[2rem] shadow-2xl shadow-brand-primary/10 flex justify-around gap-1 pointer-events-auto border border-white/25">
           <NavTab variant="mobile" active={activeTab === 'sales'} icon={ShoppingCart} label="Caja" onClick={() => setActiveTab('sales')} />
           <NavTab variant="mobile" active={activeTab === 'inventory'} icon={Package} label="Depósito" onClick={() => setActiveTab('inventory')} badgeCount={lowStockCount} />
           <NavTab variant="mobile" active={activeTab === 'reports'} icon={BarChart3} label="Dash" onClick={() => setActiveTab('reports')} badgeCount={lowStockCount} />
           <NavTab variant="mobile" active={activeTab === 'history'} icon={HistoryIcon} label="Historial" onClick={() => setActiveTab('history')} />
           <NavTab variant="mobile" active={activeTab === 'credits'} icon={WalletCards} label="Fiados" onClick={() => setActiveTab('credits')} />
        </div>
      </nav>


      {/* Settings / Sync Modal */}
      <AnimatePresence>
        {showSyncModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowSyncModal(false)}
               className="absolute inset-0 bg-brand-dark/40 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 40 }}
               className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative overflow-hidden p-8 border-4 border-white"
             >
                <div className="flex justify-between items-start mb-8">
                   <div className="flex items-center gap-4 text-brand-dark">
                      <div className="w-14 h-14 bg-brand-bg rounded-3xl flex items-center justify-center text-brand-primary">
                         <Settings size={32} />
                      </div>
                      <div>
                         <h3 className="text-2xl font-black">Ajustes</h3>
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Backup & Restore</p>
                      </div>
                   </div>
                   <button onClick={() => setShowSyncModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                     <X size={24} />
                   </button>
                </div>

                <div className="space-y-4">
                   <div className="p-5 bg-brand-bg rounded-[2rem] border border-brand-border flex gap-4">
                      <Info size={24} className="text-brand-primary shrink-0" />
                      <p className="text-xs font-bold text-brand-secondary leading-relaxed">
                        Tus datos se guardan localmente en este dispositivo. Usa las opciones de abajo para crear respaldos y evitar perder tu información.
                      </p>
                   </div>

                   <div className="p-5 bg-brand-bg rounded-[2rem] border border-brand-border flex flex-col gap-3 mb-4">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center shrink-0">
                             <AlertCircle size={20} />
                          </div>
                          <div>
                             <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Alerta de Stock Mínimo</h4>
                             <p className="text-[10px] text-slate-400 font-bold leading-normal mt-0.5">Define el umbral para notificar stock bajo</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-3 mt-1 bg-white px-4 py-2 rounded-2xl border border-brand-border">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mínimo Stock:</span>
                          <input 
                             type="number" 
                             min="1"
                             max="100"
                             value={stockThreshold} 
                             onChange={e => handleThresholdChange(parseInt(e.target.value, 10))}
                             className="w-full bg-transparent border-none text-right font-black text-brand-dark outline-none focus:ring-0 text-sm"
                          />
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <button onClick={handleExportData} className="flex flex-col items-center gap-3 p-6 bg-brand-bg hover:bg-purple-100 rounded-[2.5rem] border border-brand-border transition-all group">
                         <Download size={32} className="text-brand-primary group-hover:scale-110 transition-transform" />
                         <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">Respaldo</span>
                      </button>
                      <label className="flex flex-col items-center gap-3 p-6 bg-brand-bg hover:bg-purple-100 rounded-[2.5rem] border border-brand-border transition-all group cursor-pointer">
                         <Upload size={32} className="text-brand-secondary group-hover:scale-110 transition-transform" />
                         <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">Restaurar</span>
                         <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                      </label>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavTab: React.FC<{ 
  active: boolean, 
  icon: any, 
  label: string, 
  onClick: () => void,
  variant?: 'header' | 'mobile',
  badgeCount?: number
}> = ({ active, icon: Icon, label, onClick, variant = 'mobile', badgeCount }) => (
  <button 
    onClick={onClick} 
    className={`flex items-center justify-center gap-2 px-3 lg:px-5 py-2 lg:py-2.5 rounded-full transition-all group flex-1 lg:flex-none relative
      ${active 
        ? (variant === 'header' ? 'bg-white text-brand-dark shadow-lg shadow-white/10' : 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20') 
        : (variant === 'header' ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10')}
      ${active ? 'scale-105' : 'scale-100'}
    `}
  >
    <div className="relative flex items-center">
      <Icon size={variant === 'header' ? 16 : 20} className={active ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'} />
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
      )}
    </div>
    <span className={`text-[10px] lg:text-xs font-black tracking-tight uppercase ${active ? 'block' : (variant === 'header' ? 'hidden xl:block' : 'hidden md:block')}`}>
      {label}
    </span>
    {badgeCount !== undefined && badgeCount > 0 && (
      <span className="ml-1.5 px-2 py-0.5 text-[8px] font-black bg-red-500 text-white rounded-full leading-none shrink-0 border border-white/20">
        {badgeCount}
      </span>
    )}
  </button>
);

export default App;
