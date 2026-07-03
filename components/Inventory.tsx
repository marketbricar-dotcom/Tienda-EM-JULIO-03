
import React, { useState, useMemo } from 'react';
import { Product, Category } from '../types';
import { SUBCATEGORIES, CATEGORIES_WITH_VARIANTS, CATEGORY_EMOJIS, generateId } from '../constants';
import { Plus, Edit2, Search, PackageOpen, Trash2, AlertCircle, FileDown, Sparkles, ScanBarcode, LayoutGrid, List, ImagePlus, ImageIcon, X as CloseIcon, RefreshCcw, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ScannerModal from './ScannerModal';
import { saveProduct, deleteProduct } from '../supabaseService';

interface InventoryProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  exchangeRate: number;
}

const Inventory: React.FC<InventoryProps> = ({ products, setProducts, exchangeRate }) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGrouped, setIsGrouped] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<'search' | 'form'>('search');

  // Modal State for Deletion
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form State
  const initialFormState: Product = {
    id: '',
    name: '',
    priceUsd: 0,
    stock: 0,
    category: Category.OTROS,
    subcategory: '',
    size: '',
    costPrice: 0,
    profitPercentage: 0,
    barcode: '',
    image: ''
  };
  const [formData, setFormData] = useState<Product>(initialFormState);

  // Computed Products (Filtered)
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => 
        (selectedCategory === 'all' || p.category === selectedCategory) &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
         p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (p.barcode && p.barcode.includes(searchTerm)))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, searchTerm, selectedCategory]);

  // Grouping logic
  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    filteredProducts.forEach(product => {
      if (!groups[product.category]) {
        groups[product.category] = [];
      }
      groups[product.category].push(product);
    });
    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  const allCategories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category)));
    return ['all', ...cats.sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (isEditing) {
        await saveProduct(formData);
        setProducts(prev => prev.map(p => p.id === formData.id ? formData : p));
        setIsEditing(false);
      } else {
        const newProduct = { ...formData, id: generateId() };
        await saveProduct(newProduct);
        setProducts(prev => [...prev, newProduct]);
      }
      setFormData(initialFormState);
    } catch (error) {
      console.error("Error saving product:", error);
      alert("Error al guardar en base de datos.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (product: Product) => {
    setFormData(product);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setFormData(initialFormState);
    setIsEditing(false);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    try {
      await deleteProduct(productToDelete.id);
      setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
      if (isEditing && formData.id === productToDelete.id) handleCancel();
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Error al eliminar de base de datos.");
    } finally {
      setProductToDelete(null);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 220; // Perfect for mobile responsive grid thumbnails
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.5)); // Extremely lightweight compress
          } else {
            resolve('');
          }
        };
        img.onerror = () => resolve('');
        img.src = event.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      setFormData(prev => ({ ...prev, image: compressed }));
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(124, 58, 237);
    doc.text("Inventario EM Cute", 14, 22);
    doc.setFontSize(10); doc.setTextColor(107, 114, 128);
    doc.text(`Generado: ${new Date().toLocaleString()} | Tasa: Bs. ${exchangeRate}`, 14, 30);

    const tableData = products.map(p => [
      p.barcode || '-', p.name, p.category, p.size || '-', p.stock.toString(), `$${p.priceUsd.toFixed(2)}`, `Bs. ${(p.priceUsd * exchangeRate).toFixed(2)}`
    ]);

    autoTable(doc, {
      head: [['Código', 'Artículo', 'Categoría', 'Talla', 'Stock', 'USD', 'Bs.']],
      body: tableData, startY: 40,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [124, 58, 237] },
      alternateRowStyles: { fillColor: [250, 245, 255] }
    });
    doc.save(`inventario_${new Date().getTime()}.pdf`);
  };

  const handleScanResult = (result: string) => {
    if (scanMode === 'search') {
      setSearchTerm(result);
    } else {
      setFormData(prev => ({ ...prev, barcode: result }));
    }
    setShowScanner(false);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value as Category;
    setFormData(prev => ({
      ...prev,
      category: newCategory,
      subcategory: '',
      size: ''
    }));
  };

  const handleCostOrProfitChange = (cost: number, profit: number) => {
    let updates: Partial<Product> = { costPrice: cost, profitPercentage: profit };
    if (cost > 0 && profit > 0) {
      const suggestedPrice = cost * (1 + profit / 100);
      updates.priceUsd = parseFloat(suggestedPrice.toFixed(2));
    }
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const showSizeField = CATEGORIES_WITH_VARIANTS.includes(formData.category);
  const subOpts = SUBCATEGORIES[formData.category] || [];

  const renderProductRow = (product: Product) => (
    <motion.tr 
      key={product.id}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="hover:bg-purple-50/50 transition-colors group border-b md:border-none last:border-none"
    >
      <td className="px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-brand-bg flex-shrink-0 flex items-center justify-center overflow-hidden border border-purple-100 group-hover:scale-110 transition-transform">
            {product.image ? <img src={product.image} className="w-full h-full object-cover" /> : <ImageIcon className="text-purple-200" size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs md:text-sm font-black text-slate-700 truncate">{product.name}</div>
            <div className="flex gap-2 items-center mt-1">
              {product.barcode && <span className="text-[8px] md:text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 rounded-md border border-slate-200 truncate">{product.barcode}</span>}
              <span className="md:hidden text-[8px] font-black bg-brand-primary/10 text-brand-primary px-1.5 rounded-md uppercase">{product.category}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-xs font-bold text-brand-secondary capitalize flex items-center gap-1.5">
          <span>{CATEGORY_EMOJIS[product.category] || '📦'}</span>
          <span>{product.category}</span>
        </span>
        {product.subcategory && <span className="text-[10px] text-slate-400 block tracking-tight">{product.subcategory}</span>}
      </td>
      <td className="px-4 md:px-6 py-4 text-right">
        <div className="text-xs md:text-sm font-black text-slate-800">${product.priceUsd.toFixed(2)}</div>
        <div className="hidden md:block text-[10px] font-bold text-brand-mint italic">Bs. {(product.priceUsd * exchangeRate).toFixed(2)}</div>
      </td>
      <td className="px-4 md:px-6 py-4 text-center">
        <span className={`px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest ${product.stock > 5 ? 'bg-brand-mint/10 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
          {product.stock} <span className="hidden md:inline">un</span>
        </span>
      </td>
      <td className="px-4 md:px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => handleEdit(product)} className="p-2 text-brand-primary hover:bg-brand-primary/10 rounded-xl"><Edit2 size={16} /></button>
          <button onClick={() => setProductToDelete(product)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl"><Trash2 size={16} /></button>
        </div>
      </td>
    </motion.tr>
  );

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {showScanner && <ScannerModal onScan={handleScanResult} onClose={() => setShowScanner(false)} />}
        {productToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setProductToDelete(null)} className="absolute inset-0 bg-brand-dark/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full relative z-10 border-4 border-white shadow-2xl">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={32} /></div>
                <h3 className="text-2xl font-black text-slate-800">¿Borrar Artículo?</h3>
                <p className="text-slate-500 font-bold mt-2 text-sm leading-relaxed">No podrás recuperar <strong>{productToDelete.name}</strong> una vez eliminado.</p>
                <div className="flex gap-4 mt-8">
                  <button onClick={() => setProductToDelete(null)} className="flex-1 py-4 font-black text-slate-400 hover:bg-slate-50 rounded-3xl transition-colors">VOLVER</button>
                  <button onClick={confirmDelete} className="flex-1 py-4 bg-red-400 text-white font-black rounded-3xl shadow-lg shadow-red-100 hover:bg-red-500 transition-all">BORRAR</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Form Container */}
        <div className="lg:w-1/3">
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-xl p-6 md:p-8 border border-white lg:sticky lg:top-28">
            <div className="flex items-center gap-3 mb-6 md:mb-8">
               <div className={`w-3 h-8 rounded-full ${isEditing ? 'bg-brand-yellow' : 'bg-brand-primary'}`}></div>
               <h3 className="text-lg md:text-xl font-black text-brand-dark leading-none">{isEditing ? 'EDITANDO' : 'NUEVO PRODUCTO'}</h3>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
               <div className="flex justify-center mb-4">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-[2rem] bg-brand-bg flex items-center justify-center overflow-hidden border-2 border-dashed border-brand-primary/30 group-hover:border-brand-primary transition-all">
                       {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center text-brand-primary/40"><ImagePlus size={32} /><span className="text-[10px] font-black uppercase mt-1">Foto</span></div>}
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    {formData.image && <button type="button" onClick={() => setFormData(p => ({...p, image: ''}))} className="absolute -top-2 -right-2 bg-red-400 text-white p-1.5 rounded-full shadow-lg"><CloseIcon size={14} /></button>}
                  </div>
               </div>

               <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Nombre del Producto</label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-slate-700 focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all placeholder:text-slate-300" placeholder="Ej. T-Shirt Oveja" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Stock</label>
                        <input type="number" required min="0" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value) || 0})} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-slate-700 outline-none" />
                     </div>
                     <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Precio ($)</label>
                        <input type="number" required min="0" step="0.01" value={formData.priceUsd} onChange={e => setFormData({...formData, priceUsd: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-brand-primary outline-none" />
                     </div>
                  </div>

                  <div className="bg-purple-50 p-6 rounded-[2rem] space-y-4">
                     <p className="text-[10px] font-black uppercase text-purple-400 tracking-widest text-center">Referencia de Precio (Opcional)</p>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="text-[10px] font-black uppercase text-purple-300 tracking-widest pl-1">Costo $</label>
                           <input type="number" min="0" step="0.01" value={formData.costPrice || ''} onChange={e => handleCostOrProfitChange(parseFloat(e.target.value) || 0, formData.profitPercentage || 0)} className="w-full px-4 py-3 rounded-2xl bg-white font-bold text-slate-600 outline-none" placeholder="0.00" />
                        </div>
                        <div>
                           <label className="text-[10px] font-black uppercase text-purple-300 tracking-widest pl-1">Ganan. %</label>
                           <input type="number" min="0" step="0.1" value={formData.profitPercentage || ''} onChange={e => handleCostOrProfitChange(formData.costPrice || 0, parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 rounded-2xl bg-white font-bold text-slate-600 outline-none" placeholder="0" />
                        </div>
                     </div>
                  </div>

                  <div>
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Categoría</label>
                     <div className="relative">
                        <select value={formData.category} onChange={handleCategoryChange} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                           {Object.values(Category).sort((a, b) => a.localeCompare(b)).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-brand-primary/40"><ArrowRight size={16} /></div>
                     </div>
                  </div>

                  {subOpts.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Subcategoría</label>
                       <div className="relative">
                          <select value={formData.subcategory} onChange={e => setFormData({...formData, subcategory: e.target.value})} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                             <option value="">Seleccionar...</option>
                             {subOpts.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                          </select>
                          <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-brand-primary/40"><ArrowRight size={16} /></div>
                       </div>
                    </motion.div>
                  )}

                  {showSizeField && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Variante / Talla</label>
                       <input type="text" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-slate-700 outline-none" placeholder="Color, Talla, etc." />
                    </motion.div>
                  )}

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Código Barra</label>
                    <div className="relative">
                       <input type="text" value={formData.barcode || ''} onChange={e => setFormData({...formData, barcode: e.target.value})} className="w-full px-5 py-4 rounded-3xl bg-brand-bg font-bold text-slate-700 outline-none" placeholder="Opcional..." />
                       <button type="button" onClick={() => { setScanMode('form'); setShowScanner(true); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-primary"><ScanBarcode size={20} /></button>
                    </div>
                  </div>
               </div>

               <div className="flex gap-4 pt-4">
                  <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-brand-primary text-white font-black rounded-3xl shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm flex items-center justify-center gap-2">
                     {isSaving ? <RefreshCcw className="animate-spin" size={18} /> : (isEditing ? <Edit2 size={18} /> : <Plus size={18} />)}
                     {isSaving ? 'GUARDANDO...' : (isEditing ? 'ACTUALIZAR' : 'GUARDAR')}
                  </button>
                  {isEditing && <button type="button" onClick={handleCancel} className="px-6 rounded-3xl bg-slate-100 text-slate-500 font-black text-sm">X</button>}
               </div>
            </form>
          </div>
        </div>

        {/* List Container */}
        <div className="lg:w-2/3">
           <div className="bg-white rounded-[2.5rem] shadow-xl border border-white overflow-hidden">
              <div className="p-6 bg-white border-b border-brand-bg flex flex-col md:flex-row gap-4 items-center justify-between sticky top-0 z-10">
                 <div className="flex items-center gap-3 w-full md:max-w-sm relative group">
                    <Search className="absolute left-4 text-brand-primary/50 group-focus-within:text-brand-primary" size={20} />
                    <input type="text" placeholder="Buscar cosita..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-16 py-3 bg-brand-bg rounded-2xl outline-none font-bold text-slate-700 border-2 border-transparent focus:border-brand-primary/20 transition-all" />
                    <button onClick={() => { setScanMode('search'); setShowScanner(true); }} className="absolute right-3 p-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 transition-colors" title="Escanear Barra">
                       <ScanBarcode size={18} />
                    </button>
                 </div>
                 
                 <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => setIsGrouped(!isGrouped)} className={`flex-1 md:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isGrouped ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-primary hover:bg-purple-100'}`}>
                       {isGrouped ? <LayoutGrid size={16} /> : <List size={16} />}
                       <span>{isGrouped ? 'Separados 🗂️' : 'Juntos 📱'}</span>
                    </button>
                    <button onClick={handleDownloadPDF} className="px-6 py-3 bg-brand-mint/10 text-emerald-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-50">
                       <FileDown size={18} /> PDF
                    </button>
                 </div>
              </div>

              {/* Horizontal Category Selector */}
              <div className="px-6 py-4 bg-brand-bg/10 border-b border-purple-50 overflow-x-auto md:overflow-x-visible no-scrollbar">
                 <div className="flex flex-nowrap md:flex-wrap gap-2 pb-1 md:pb-0">
                    {allCategories.map(cat => {
                       const count = cat === 'all'
                          ? products.length
                          : products.filter(p => p.category === cat).length;

                       return (
                          <button
                             key={cat}
                             onClick={() => setSelectedCategory(cat)}
                             className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border-2
                               ${selectedCategory === cat 
                                  ? 'bg-brand-primary border-brand-primary text-white shadow-md shadow-brand-primary/20 scale-[1.03]' 
                                  : 'bg-brand-bg/50 border-purple-100/50 text-slate-600 hover:border-brand-primary/20 hover:bg-white'
                               }
                             `}
                          >
                             <span>{cat === 'all' ? '✨ TODOS' : `${CATEGORY_EMOJIS[cat] || '📦'} ${cat}`}</span>
                             <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold
                               ${selectedCategory === cat ? 'bg-white/20 text-white' : 'bg-brand-bg text-brand-primary'}
                             `}>
                                {count}
                             </span>
                          </button>
                       );
                    })}
                 </div>
              </div>

              <div className="overflow-x-auto min-h-[400px]">
                 {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                       <PackageOpen size={64} className="mb-4 opacity-20" />
                       <p className="font-bold uppercase tracking-widest text-xs">No se encontraron cositas</p>
                    </div>
                 ) : isGrouped ? (
                   <div className="divide-y divide-purple-50">
                      {Object.entries(groupedProducts).map(([category, prods]) => (
                        <div key={category}>
                           <div className="bg-brand-bg/50 px-6 py-3 flex items-center justify-between border-y border-purple-50">
                              <h4 className="text-[10px] font-black text-brand-secondary uppercase tracking-[0.3em] flex items-center gap-2">
                                <span>{CATEGORY_EMOJIS[category] || '📦'}</span>
                                <span>{category}</span>
                              </h4>
                              <span className="text-[10px] font-black bg-white px-3 py-1 rounded-full text-brand-primary shadow-sm">{prods.length}</span>
                           </div>
                           <table className="w-full">
                              <tbody className="divide-y divide-purple-50">
                                 {prods.map(p => renderProductRow(p))}
                              </tbody>
                           </table>
                        </div>
                      ))}
                   </div>
                 ) : (
                   <table className="w-full text-left">
                      <thead className="bg-brand-bg/30">
                         <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cosita</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Info</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Precio</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Admin</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-50">
                         {filteredProducts.map(p => renderProductRow(p))}
                      </tbody>
                   </table>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
