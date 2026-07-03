import React, { useMemo, useState } from 'react';
import { Product, Sale, PaymentMethod } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, ClipboardList, TrendingUp, Download, Star, DollarSign, Package, AlertCircle, Calendar, Filter } from 'lucide-react';
import { motion } from 'motion/react';

interface ReportsProps {
  products: Product[];
  sales: Sale[];
  exchangeRate: number;
  stockThreshold: number;
}

const Reports: React.FC<ReportsProps> = ({ products, sales, exchangeRate, stockThreshold }) => {
  // Configurable Range States (Supports at least 1 month up to a year)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // Default to last 30 days
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState<'all' | 'sales' | 'credits'>('all');

  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.stock < stockThreshold);
  }, [products, stockThreshold]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => s.date.startsWith(today));
    const todayTotal = todaySales.reduce((acc, s) => acc + s.totalUsd, 0);
    
    const inventoryValue = products.reduce((acc, p) => acc + (p.priceUsd * p.stock), 0);
    const lowStockCount = products.filter(p => p.stock < stockThreshold).length;
    
    return { todayTotal, inventoryValue, lowStockCount, todayCount: todaySales.length };
  }, [sales, products, stockThreshold]);

  // Generates inventory list report PDF (Correcting previous placeholder bug)
  const generateInventoryPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(124, 58, 237);
    doc.text("EM Tienda Cute - Inventario Completo", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generado: ${new Date().toLocaleString()} | Tasa: Bs. ${exchangeRate}`, 14, 28);

    const tableData = products.map(p => [
      p.name,
      p.category,
      p.barcode || 'N/A',
      `$${p.priceUsd.toFixed(2)}`,
      `Bs. ${(p.priceUsd * exchangeRate).toFixed(2)}`,
      p.stock.toString()
    ]);

    autoTable(doc, {
      head: [['Producto', 'Categoría', 'Código de Barra', 'Precio USD', 'Precio Bs.', 'Stock']],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [124, 58, 237] },
      alternateRowStyles: { fillColor: [250, 245, 255] }
    });

    doc.save(`inventario_completo_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Generates sales and credits report for dynamic period (at least 1 month up to a year)
  const generateSalesPDF = (period: 'daily' | 'monthly') => {
    const doc = new jsPDF();
    const now = new Date();
    
    let filteredSales = sales;
    let title = "";

    if (period === 'daily') {
      const todayStr = now.toISOString().split('T')[0];
      filteredSales = sales.filter(s => s.date.startsWith(todayStr));
      title = `Reporte del Día (${todayStr})`;
    } else {
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      filteredSales = sales.filter(s => {
        const d = new Date(s.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      title = `Reporte de Ventas del Mes (${currentMonth + 1}/${currentYear})`;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(124, 58, 237);
    doc.text("EM Cute - Reporte de Ventas", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`${title} | Tasa: Bs. ${exchangeRate}`, 14, 28);

    const tableData = filteredSales.map(sale => [
      new Date(sale.date).toLocaleString(),
      sale.clientName || 'Cliente General',
      sale.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
      sale.paymentMethod,
      `$${sale.totalUsd.toFixed(2)}`,
      `Bs. ${(sale.totalUsd * sale.exchangeRate).toFixed(2)}`
    ]);

    autoTable(doc, {
      head: [['Fecha', 'Cliente', 'Artículos', 'Pago', 'USD', 'Bs.']],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [124, 58, 237] },
      alternateRowStyles: { fillColor: [250, 245, 255] }
    });

    const totalUsd = filteredSales.reduce((acc, s) => acc + s.totalUsd, 0);
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(12);
    doc.setTextColor(124, 58, 237);
    doc.text(`TOTAL TRANSACCIONADO: $${totalUsd.toFixed(2)} (Bs. ${(totalUsd * exchangeRate).toFixed(2)})`, 14, finalY);

    doc.save(`reporte_${period}.pdf`);
  };

  // Generates report for any customizable date range (maintaining history for 1 month or up to approximately 1 year)
  const generateCustomRangePDF = () => {
    const doc = new jsPDF();
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const filtered = sales.filter(s => {
      const d = new Date(s.date);
      const inRange = d >= start && d <= end;
      if (!inRange) return false;

      const isCredit = s.paymentMethod === 'Crédito';
      if (reportType === 'sales') return !isCredit;
      if (reportType === 'credits') return isCredit;
      return true;
    });

    const typeLabel = reportType === 'sales' ? 'Ventas Contado' : (reportType === 'credits' ? 'Créditos / Fiados' : 'Ventas y Créditos');
    const title = `Reporte Histórico (${typeLabel})`;
    const subtitle = `Periodo: ${startDate} al ${endDate}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(124, 58, 237);
    doc.text(`EM Tienda Cute - ${title}`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`${subtitle} | Tasa: Bs. ${exchangeRate}`, 14, 28);

    const tableData = filtered.map(sale => [
      new Date(sale.date).toLocaleString(),
      sale.clientName || 'Cliente Regular',
      sale.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
      sale.paymentMethod,
      `$${sale.totalUsd.toFixed(2)}`,
      `Bs. ${(sale.totalUsd * sale.exchangeRate).toFixed(2)}`
    ]);

    autoTable(doc, {
      head: [['Fecha', 'Cliente', 'Artículos', 'Método', 'USD', 'Bs.']],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [124, 58, 237] },
      alternateRowStyles: { fillColor: [250, 245, 255] }
    });

    const totalUsd = filtered.reduce((acc, s) => acc + s.totalUsd, 0);
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    
    doc.setFontSize(12);
    doc.setTextColor(124, 58, 237);
    doc.text(`RESUMEN GENERAL: $${totalUsd.toFixed(2)} USD | Bs. ${(totalUsd * exchangeRate).toFixed(2)}`, 14, finalY);

    doc.save(`reporte_historico_${startDate}_a_${endDate}.pdf`);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <motion.h2 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-black text-brand-dark">Reportes EM Cute</motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Tus estadísticas lindas en PDF</motion.p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
         <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-4 border-white shadow-xl shadow-purple-100/50 flex flex-col items-center text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-mint/20 text-emerald-500 rounded-2xl flex items-center justify-center mb-3 md:mb-4"><DollarSign size={20} /></div>
            <div className="text-2xl md:text-3xl font-black text-slate-800">${stats.todayTotal.toFixed(2)}</div>
            <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase mt-1 md:mt-2 tracking-widest">Ventas Hoy ({stats.todayCount})</div>
         </motion.div>

         <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-4 border-white shadow-xl shadow-purple-100/50 flex flex-col items-center text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mb-3 md:mb-4"><Package size={20} /></div>
            <div className="text-2xl md:text-3xl font-black text-slate-800">${stats.inventoryValue.toFixed(2)}</div>
            <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase mt-1 md:mt-2 tracking-widest">Valor Inventario</div>
         </motion.div>

         <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-4 border-white shadow-xl shadow-purple-100/50 flex flex-col items-center text-center sm:col-span-2 md:col-span-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-red-50 text-red-400 rounded-2xl flex items-center justify-center mb-3 md:mb-4"><AlertCircle size={20} /></div>
            <div className="text-2xl md:text-3xl font-black text-slate-800">{stats.lowStockCount}</div>
            <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase mt-1 md:mt-2 tracking-widest">Poco Stock</div>
         </motion.div>
      </div>

      {/* Visual Alert for Low Stock Products with configurable threshold */}
      {lowStockProducts.length > 0 && (
         <motion.div 
           initial={{ y: 20, opacity: 0 }} 
           animate={{ y: 0, opacity: 1 }} 
           className="bg-red-50 border-4 border-red-100 p-6 rounded-[2.5rem] shadow-xl shadow-red-100/20 flex flex-col gap-4"
         >
            <div className="flex items-start gap-4">
               <div className="w-12 h-12 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center shrink-0 animate-bounce">
                  <AlertCircle size={24} />
               </div>
               <div>
                  <h3 className="text-base font-black text-red-800 uppercase tracking-tight">⚠️ Alerta de Stock Bajo</h3>
                  <p className="text-xs text-red-600/95 font-bold mt-0.5">
                     Tienes {lowStockProducts.length} {lowStockProducts.length === 1 ? 'producto' : 'productos'} con stock por debajo del umbral mínimo ({stockThreshold} unidades).
                  </p>
                  
                  {/* List of low stock products with details */}
                  <div className="flex flex-wrap gap-2 mt-3">
                     {lowStockProducts.map(p => (
                        <span key={p.id} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-red-600 font-extrabold text-[10px] rounded-full border border-red-200 shadow-sm uppercase tracking-wider">
                           {p.name} — <strong className="text-red-700 font-black">{p.stock} {p.stock === 1 ? 'unidad' : 'unidades'}</strong>
                        </span>
                     ))}
                  </div>
               </div>
            </div>
         </motion.div>
      )}

      {/* NEW: Historical Report Selection Panel (Dynamic monthly up to 1 year range) */}
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="bg-white p-8 rounded-[3rem] border-4 border-white shadow-2xl flex flex-col gap-6">
         <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 text-brand-primary rounded-2xl flex items-center justify-center"><Calendar size={24} /></div>
            <div>
               <h3 className="text-lg font-black text-slate-800">Generar Reporte Personalizado (Hasta 1 Año)</h3>
               <p className="text-xs text-slate-400 font-bold">Configura el rango de fechas de tu preferencia para ventas y fiados</p>
            </div>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Inicio</label>
               <input 
                 type="date" 
                 value={startDate} 
                 onChange={e => setStartDate(e.target.value)}
                 className="w-full px-4 py-3 bg-brand-bg font-extrabold rounded-2xl border-2 border-transparent focus:border-brand-primary text-slate-700 outline-none text-xs"
               />
            </div>
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Fin</label>
               <input 
                 type="date" 
                 value={endDate} 
                 onChange={e => setEndDate(e.target.value)}
                 className="w-full px-4 py-3 bg-brand-bg font-extrabold rounded-2xl border-2 border-transparent focus:border-brand-primary text-slate-700 outline-none text-xs"
               />
            </div>
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtro de Reporte</label>
               <select 
                 value={reportType}
                 onChange={e => setReportType(e.target.value as any)}
                 className="w-full px-4 py-3 bg-brand-bg font-extrabold rounded-2xl border-2 border-transparent focus:border-brand-primary text-slate-700 outline-none text-xs"
               >
                  <option value="all">Ventas + Fiados</option>
                  <option value="sales">Solo Ventas</option>
                  <option value="credits">Solo Fiados (A Crédito)</option>
               </select>
            </div>
         </div>

         <button 
           onClick={generateCustomRangePDF}
           className="w-full py-4 bg-brand-dark text-white font-black rounded-3xl hover:bg-transparent hover:text-brand-dark border-2 border-brand-dark transition-all text-xs flex items-center justify-center gap-3 uppercase tracking-wider shadow-lg"
         >
            <Download size={18} /> GENERAR REPORTE PDF SELECCIONADO
         </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="bg-white p-8 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center gap-6">
           <div className="w-20 h-20 bg-brand-yellow/20 text-yellow-600 rounded-[2rem] flex items-center justify-center group-hover:scale-110 transition-transform"><TrendingUp size={40} /></div>
           <div>
              <h3 className="text-xl font-black text-slate-800">Reportes Rápidos</h3>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">Reporte estándar del día o del mes actual</p>
           </div>
           <div className="w-full flex gap-3">
              <button onClick={() => generateSalesPDF('daily')} className="flex-1 py-4 bg-brand-bg hover:bg-brand-primary/10 text-brand-primary font-black rounded-3xl transition-all flex items-center justify-center gap-2 text-xs">
                 <Star size={16}/> HOY
              </button>
              <button onClick={() => generateSalesPDF('monthly')} className="flex-1 py-4 bg-brand-dark text-white font-black rounded-3xl shadow-lg border-2 border-brand-dark hover:bg-transparent hover:text-brand-dark transition-all flex items-center justify-center gap-2 text-xs">
                 <Download size={16}/> MES DETALLADO
              </button>
           </div>
        </motion.div>

        <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="bg-white p-8 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center gap-6">
           <div className="w-20 h-20 bg-brand-mint/20 text-emerald-500 rounded-[2rem] flex items-center justify-center group-hover:scale-110 transition-transform"><ClipboardList size={40} /></div>
           <div>
              <h3 className="text-xl font-black text-slate-800">Inventario Completo</h3>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">Listado detallado con stock y precios actuales</p>
           </div>
           <button onClick={generateInventoryPDF} className="w-full py-4 bg-brand-primary text-white font-black rounded-3xl shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-xs flex items-center justify-center gap-3">
              <FileText size={20} /> DESCARGAR LISTA COMPLETA
           </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Reports;
