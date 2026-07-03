import React, { useState, useMemo } from 'react';
import { Sale, PaymentMethod, CreditPayment, CartItem, Product } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  WalletCards, Search, CheckCircle2, FileDown, CalendarClock, User, 
  Star, ArrowRight, PlusCircle, X, Trash2, Coins, ArrowUpRight, 
  ArrowDownLeft, Info, Calendar, Sparkles, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveSaleObj, saveProduct, deleteSaleObj } from '../supabaseService';

interface CreditsProps {
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  exchangeRate: number;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}

interface GroupedClient {
  clientName: string;
  sales: Sale[];
  totalDebtUsd: number;
  totalDebtBs: number;
  totalPaidUsd: number;
  totalPaidBs: number;
  netPendingUsd: number;
  netPendingBs: number;
  lastMovementDate: string;
}

interface Movement {
  id: string; // saleId or paymentId
  type: 'purchase' | 'payment';
  date: string;
  amountUsd: number;
  amountBs: number;
  rate: number;
  details: string; // List of items or payment notes
  items?: CartItem[];
  method?: string;
}

const Credits: React.FC<CreditsProps> = ({ sales, setSales, exchangeRate, products, setProducts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedClient, setSelectedClient] = useState<GroupedClient | null>(null);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Abono Form State
  const [abonoForm, setAbonoForm] = useState({
    amountUsd: '',
    amountBs: '',
    paymentMethod: PaymentMethod.EFECTIVO_USD,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Change Calculator State
  const [calculatorReceived, setCalculatorReceived] = useState('');
  const [calculatorCurrency, setCalculatorCurrency] = useState<'USD' | 'BS'>('USD');

  // Unique clients and their grouped records
  const groupedClients = useMemo(() => {
    const clientsMap: Record<string, Sale[]> = {};

    // Collect all sales with credit
    sales.forEach(sale => {
      if (sale.paymentMethod === PaymentMethod.CREDITO && sale.clientName) {
        const normalized = sale.clientName.trim();
        if (!clientsMap[normalized]) {
          clientsMap[normalized] = [];
        }
        clientsMap[normalized].push(sale);
      }
    });

    const result: GroupedClient[] = Object.entries(clientsMap).map(([name, clientSales]) => {
      let totalDebtUsd = 0;
      let totalDebtBs = 0;
      let totalPaidUsd = 0;
      let totalPaidBs = 0;
      
      let lastDate = '';

      clientSales.forEach(sale => {
        // Debts
        totalDebtUsd += sale.totalUsd;
        totalDebtBs += sale.totalUsd * sale.exchangeRate;

        // Date check
        const sDate = sale.creditDate || sale.date;
        if (!lastDate || new Date(sDate).getTime() > new Date(lastDate).getTime()) {
          lastDate = sDate;
        }

        // Payments (Abonos)
        if (sale.payments && Array.isArray(sale.payments)) {
          sale.payments.forEach(p => {
            totalPaidUsd += p.amountUsd;
            totalPaidBs += p.amountBs;
            
            if (new Date(p.date).getTime() > new Date(lastDate).getTime()) {
              lastDate = p.date;
            }
          });
        }
      });

      const netPendingUsd = totalDebtUsd - totalPaidUsd;
      const netPendingBs = totalDebtBs - totalPaidBs;

      return {
        clientName: name,
        sales: clientSales,
        totalDebtUsd,
        totalDebtBs,
        totalPaidUsd,
        totalPaidBs,
        netPendingUsd: Math.max(0, netPendingUsd),
        netPendingBs: Math.max(0, netPendingBs),
        lastMovementDate: lastDate || new Date().toISOString(),
      };
    });

    // Advanced filtering by client name, product names, or transaction date
    return result.filter(client => {
      const matchesName = client.clientName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesProduct = client.sales.some(sale => 
        sale.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      const matchesDate = !searchDate || client.sales.some(sale => {
        const sDate = sale.creditDate || sale.date;
        return sDate.startsWith(searchDate);
      });

      return (matchesName || matchesProduct) && matchesDate;
    }).sort((a, b) => b.netPendingUsd - a.netPendingUsd); // Those with most debt first
  }, [sales, searchTerm, searchDate]);

  // Keep selected client updated if sales change globally
  const activeSelectedClient = useMemo(() => {
    if (!selectedClient) return null;
    return groupedClients.find(c => c.clientName === selectedClient.clientName) || null;
  }, [groupedClients, selectedClient]);

  const globalTotalPendingUsd = useMemo(() => 
    groupedClients.reduce((acc, curr) => acc + curr.netPendingUsd, 0)
  , [groupedClients]);

  const globalTotalPendingBs = useMemo(() => 
    groupedClients.reduce((acc, curr) => acc + curr.netPendingBs, 0)
  , [groupedClients]);

  // Build unified chronological history/movement list for a client
  const clientMovements = useMemo(() => {
    if (!activeSelectedClient) return [];
    const moves: Movement[] = [];

    activeSelectedClient.sales.forEach(sale => {
      // 1. Purchase movement
      moves.push({
        id: sale.id,
        type: 'purchase',
        date: sale.creditDate || sale.date,
        amountUsd: sale.totalUsd,
        amountBs: sale.totalUsd * sale.exchangeRate,
        rate: sale.exchangeRate,
        details: sale.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
        items: sale.items,
      });

      // 2. Payments movements
      if (sale.payments) {
        sale.payments.forEach(p => {
          moves.push({
            id: p.id,
            type: 'payment',
            date: p.date,
            amountUsd: p.amountUsd,
            amountBs: p.amountBs,
            rate: p.amountUsd > 0 ? (p.amountBs / p.amountUsd) : exchangeRate,
            details: p.notes || 'Abono recibido',
            method: p.paymentMethod,
          });
        });
      }
    });

    // Sort: Newest first
    return moves.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeSelectedClient, exchangeRate]);

  // Handle saving an Abono with recursive split across oldest pending credit sales
  const handleSaveAbono = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSelectedClient) return;

    const parsedUsd = parseFloat(abonoForm.amountUsd);
    const parsedBs = parseFloat(abonoForm.amountBs);

    if (isNaN(parsedUsd) || parsedUsd <= 0) {
      alert("Ingrese un monto válido mayor a 0.");
      return;
    }

    let remainingPaymentUsd = parsedUsd;
    let remainingPaymentBs = parsedBs;
    const paymentId = 'pay_' + Math.random().toString(36).substr(2, 9);
    
    // Unpaid sales sorted oldest first
    const unpaidSales = [...activeSelectedClient.sales]
      .filter(s => {
        const statusPaid = s.isPaid || false;
        if (statusPaid) return false;
        // Verify manual balance check
        const paidTotal = (s.payments || []).reduce((sum, p) => sum + p.amountUsd, 0);
        return (s.totalUsd - paidTotal) > 0.01;
      })
      .sort((a, b) => new Date(a.creditDate || a.date).getTime() - new Date(b.creditDate || b.date).getTime());

    if (unpaidSales.length === 0) {
      alert("Este cliente no tiene deudas pendientes.");
      return;
    }

    const updatedSales = sales.map(sale => {
      const isMyDebtor = unpaidSales.some(us => us.id === sale.id);
      if (!isMyDebtor || remainingPaymentUsd <= 0) {
        return sale;
      }

      const alreadyPaidUsd = (sale.payments || []).reduce((sum, p) => sum + p.amountUsd, 0);
      const saleRemainingUsd = sale.totalUsd - alreadyPaidUsd;

      const appliedUsd = Math.min(remainingPaymentUsd, saleRemainingUsd);
      const fraction = appliedUsd / parsedUsd;
      const appliedBs = parsedBs * fraction;

      remainingPaymentUsd -= appliedUsd;
      remainingPaymentBs -= appliedBs;

      const newPayment: CreditPayment = {
        id: paymentId,
        date: new Date(abonoForm.date).toISOString(),
        amountUsd: appliedUsd,
        amountBs: appliedBs,
        paymentMethod: abonoForm.paymentMethod,
        notes: abonoForm.notes.trim() || 'Abono general'
      };

      const updatedPayments = [...(sale.payments || []), newPayment];
      const newPaidSum = alreadyPaidUsd + appliedUsd;
      const isFullyPaid = (sale.totalUsd - newPaidSum) <= 0.01;

      return {
        ...sale,
        payments: updatedPayments,
        isPaid: isFullyPaid
      };
    });

    try {
      // Save all modified sales to Supabase
      for (const sale of updatedSales) {
        const oldSale = sales.find(s => s.id === sale.id);
        if (JSON.stringify(oldSale?.payments) !== JSON.stringify(sale.payments)) {
          await saveSaleObj(sale);
        }
      }

      setSales(updatedSales);
      setShowAbonoModal(false);
      
      // Reset Form
      setAbonoForm({
        amountUsd: '',
        amountBs: '',
        paymentMethod: PaymentMethod.EFECTIVO_USD,
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (err) {
      console.error("Error saving payment to Supabase:", err);
      alert("Error al registrar abono en la base de datos.");
    }
  };

  // Void a payment receipt entirely (across all sales it was split into)
  const handleVoidPayment = async (paymentId: string) => {
    if (window.confirm("¿Seguro que deseas anular este abono? La deuda regresará a su estado anterior.")) {
      try {
        const updated = sales.map(sale => {
          if (!sale.payments) return sale;
          const hasPayment = sale.payments.some(p => p.id === paymentId);
          if (!hasPayment) return sale;

          const filteredPayments = sale.payments.filter(p => p.id !== paymentId);
          const alreadyPaidUsd = filteredPayments.reduce((sum, p) => sum + p.amountUsd, 0);
          const isStillPaid = (sale.totalUsd - alreadyPaidUsd) <= 0.01;

          return {
            ...sale,
            payments: filteredPayments,
            isPaid: isStillPaid
          };
        });

        // Save updated sales to Supabase
        for (const sale of updated) {
          const oldSale = sales.find(s => s.id === sale.id);
          if (JSON.stringify(oldSale?.payments) !== JSON.stringify(sale.payments)) {
            await saveSaleObj(sale);
          }
        }

        setSales(updated);
      } catch (err) {
        console.error("Error voiding payment from Supabase:", err);
        alert("Error al anular abono en la base de datos.");
      }
    }
  };

  // Delete / annul a credit purchase (sale) entirely and return products to stock
  const handleDeletePurchase = async (saleId: string, items: CartItem[]) => {
    if (window.confirm("¿Seguro que deseas anular este crédito/compra? Los productos serán devueltos al depósito.")) {
      try {
        // 1. Return stock in Supabase
        for (const item of items) {
          const p = products.find(prod => prod.id === item.id);
          if (p) {
            await saveProduct({ ...p, stock: p.stock + item.quantity });
          }
        }

        // 2. Delete sale & credit from Supabase
        await deleteSaleObj(saleId);

        // 3. Update local UI state
        setProducts(prev => prev.map(p => {
          const item = items.find(i => i.id === p.id);
          return item ? { ...p, stock: p.stock + item.quantity } : p;
        }));

        setSales(prev => prev.filter(s => s.id !== saleId));
      } catch (err) {
        console.error("Error voiding credit purchase from Supabase:", err);
        alert("Error al anular la compra a crédito de la base de datos.");
      }
    }
  };

  // Pay completely the outstanding balance of a client
  const handlePayCompleteBalance = () => {
    if (!activeSelectedClient) return;
    if (activeSelectedClient.netPendingUsd <= 0) {
      alert("El cliente no tiene deuda pendiente para saldar.");
      return;
    }

    if (window.confirm(`¿Confirmas saldar el total de la deuda por $${activeSelectedClient.netPendingUsd.toFixed(2)} (${(activeSelectedClient.netPendingBs).toFixed(2)} Bs.)?`)) {
      setAbonoForm({
        amountUsd: activeSelectedClient.netPendingUsd.toString(),
        amountBs: activeSelectedClient.netPendingBs.toString(),
        paymentMethod: PaymentMethod.EFECTIVO_USD,
        date: new Date().toISOString().split('T')[0],
        notes: 'Saldado total',
      });
      setShowAbonoModal(true);
    }
  };

  // Input sync handles conversions
  const handleUsdChange = (val: string) => {
    const usd = parseFloat(val);
    setAbonoForm(prev => ({
      ...prev,
      amountUsd: val,
      amountBs: isNaN(usd) ? '' : (usd * exchangeRate).toFixed(2)
    }));
  };

  const handleBsChange = (val: string) => {
    const bs = parseFloat(val);
    setAbonoForm(prev => ({
      ...prev,
      amountBs: val,
      amountUsd: isNaN(bs) ? '' : (bs / exchangeRate).toFixed(2)
    }));
  };

  // PDF backup reports
  const generateCreditsPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(124, 58, 237); // Purple 600
    doc.text("Reporte de Acreedores EM Tienda", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generado: ${new Date().toLocaleString()} | Tasa de cambio: Bs. ${exchangeRate}`, 14, 28);

    const tableData = groupedClients
      .filter(c => c.netPendingUsd > 0)
      .map(client => [
        client.clientName,
        new Date(client.lastMovementDate).toLocaleDateString(),
        `$${client.totalDebtUsd.toFixed(2)}`,
        `$${client.totalPaidUsd.toFixed(2)}`,
        `$${client.netPendingUsd.toFixed(2)}`,
        `Bs. ${client.netPendingBs.toFixed(2)}`
      ]);

    autoTable(doc, {
      head: [['Cliente', 'Último Movimiento', 'Crédito Inicial', 'Total Abonado', 'Resta (USD)', 'Resta (Bs.)']],
      body: tableData,
      startY: 35,
      headStyles: { fillColor: [124, 58, 237] }
    });

    doc.save(`cartera_clientes_fiados_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Top bar indicators */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
           <motion.h2 initial={{ x: -25, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-3xl font-black text-brand-dark flex items-center gap-3">
             Cuentas por Cobrar <WalletCards className="text-brand-primary" size={32} />
           </motion.h2>
           <motion.p initial={{ x: -25, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Cuentas de Clientes Agrupados</motion.p>
        </div>

        {/* Dynamic double currency total indicator */}
        <div className="flex flex-wrap gap-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white px-6 py-4 rounded-[2rem] border-4 border-white shadow-lg flex items-center gap-4">
             <div className="w-12 h-12 bg-purple-100 text-brand-secondary rounded-2xl flex items-center justify-center font-bold text-lg">$</div>
             <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pendiente USD</p>
                <div className="text-2xl font-black text-brand-dark">${globalTotalPendingUsd.toFixed(2)}</div>
             </div>
          </motion.div>

          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white px-6 py-4 rounded-[2rem] border-4 border-white shadow-lg flex items-center gap-4">
             <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold text-xs">Bs</div>
             <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pendiente Bs.</p>
                <div className="text-2xl font-black text-emerald-600">Bs. {globalTotalPendingBs.toFixed(2)}</div>
             </div>
          </motion.div>
        </div>
      </div>

      {/* Action Filters Section */}
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white p-4 rounded-[2.5rem] border-4 border-white shadow-xl flex flex-col sm:flex-row gap-4 items-center">
         <div className="relative flex-1 group w-full">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary/40 w-5 h-5 group-focus-within:text-brand-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar por cliente o artículo comprado..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-14 pr-8 py-4 rounded-[1.8rem] bg-brand-bg font-black text-slate-700 outline-none text-sm placeholder:text-slate-300 border-2 border-transparent focus:border-brand-primary" 
            />
         </div>

         {/* Credit date selector */}
         <div className="relative w-full sm:w-52 flex items-center bg-brand-bg rounded-[1.8rem] px-5 py-3.5 border-2 border-transparent focus-within:border-brand-primary">
            <Calendar className="text-brand-primary/40 w-5 h-5 mr-2 shrink-0" />
            <input 
              type="date" 
              value={searchDate} 
              onChange={e => setSearchDate(e.target.value)} 
              className="w-full bg-transparent font-black text-slate-700 outline-none text-xs" 
            />
         </div>

         <button 
           onClick={generateCreditsPDF} 
           disabled={groupedClients.length === 0} 
           className="w-full sm:w-auto px-8 py-4 bg-brand-dark text-white font-black rounded-[1.8rem] shadow-lg flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all text-xs disabled:opacity-30 shrink-0"
         >
            <FileDown size={20} /> REPORTE CARTERA PDF
         </button>
      </motion.div>

      {/* Debtor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {groupedClients.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full py-16 flex flex-col items-center justify-center text-center opacity-45 gap-6">
               <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center shadow-inner"><Star size={36} className="text-emerald-500 fill-emerald-400" /></div>
               <div className="space-y-1">
                 <p className="font-black text-slate-800 uppercase tracking-widest text-sm">¡Cartera Impecable!</p>
                 <p className="text-xs text-slate-400 font-bold">No se encontraron deudores o cuentas pendientes.</p>
               </div>
            </motion.div>
          ) : (
            groupedClients.map((client, idx) => {
              const hasDebt = client.netPendingUsd > 0.01;
              return (
                <motion.div 
                  layout 
                  initial={{ scale: 0.95, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  transition={{ delay: idx * 0.03 }} 
                  key={client.clientName} 
                  className={`bg-white rounded-[2.5rem] p-6 border-4 shadow-xl transition-all relative flex flex-col justify-between overflow-hidden group
                    ${hasDebt ? 'border-white shadow-purple-50 hover:shadow-purple-100' : 'border-emerald-50/50 shadow-emerald-50/50 hover:shadow-emerald-100/60'}
                  `}
                >
                  {/* Small absolute indicator status */}
                  {!hasDebt && (
                    <div className="absolute right-4 top-4 bg-emerald-100 text-emerald-800 font-black text-[8px] uppercase px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                      <Star size={10} className="fill-emerald-800" /> Solventado
                    </div>
                  )}

                  <div>
                    {/* Header detail */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm
                        ${hasDebt ? 'bg-purple-100 text-brand-secondary' : 'bg-emerald-100 text-emerald-700'}
                      `}>
                        <User size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-slate-800 text-lg leading-tight truncate pr-14">{client.clientName}</h4>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-1">
                          <ClockAndCalendar date={client.lastMovementDate} />
                        </p>
                      </div>
                    </div>

                    {/* Pending state */}
                    <div className="grid grid-cols-2 gap-2 bg-brand-bg/50 p-4 rounded-2xl border border-purple-100/30 mb-5 text-center">
                      <div>
                        <div className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Saldo USD</div>
                        <div className={`text-xl font-black ${hasDebt ? 'text-brand-dark' : 'text-slate-400'}`}>
                          ${client.netPendingUsd.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Saldo Bs.</div>
                        <div className={`text-xl font-black ${hasDebt ? 'text-emerald-600' : 'text-slate-400'}`}>
                          Bs. {client.netPendingBs.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Summary statistics */}
                    <div className="flex justify-between items-center px-2 text-[10px] font-bold text-slate-500 mb-6 pb-2 border-b border-dashed border-purple-100">
                      <span>Total Comprado: <b className="text-slate-700 font-extrabold">${client.totalDebtUsd.toFixed(1)}</b></span>
                      <span>Total Abonado: <b className="text-slate-700 font-extrabold">${client.totalPaidUsd.toFixed(1)}</b></span>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="space-y-2 mt-4 shrink-0">
                    <button 
                      onClick={() => {
                        setSelectedClient(client);
                        setShowDetailsModal(true);
                      }} 
                      className="w-full py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-brand-dark font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border border-purple-100"
                    >
                      <Info size={14} /> Ver Ficha y Movimientos
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => {
                          setSelectedClient(client);
                          setAbonoForm({
                            amountUsd: '',
                            amountBs: '',
                            paymentMethod: PaymentMethod.EFECTIVO_USD,
                            date: new Date().toISOString().split('T')[0],
                            notes: '',
                          });
                          setCalculatorReceived('');
                          setShowAbonoModal(true);
                        }}
                        disabled={!hasDebt}
                        className="py-2.5 px-3 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Coins size={12} /> Abono Parcial
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedClient(client);
                          // Populate full payment immediately
                          setAbonoForm({
                            amountUsd: client.netPendingUsd.toString(),
                            amountBs: client.netPendingBs.toString(),
                            paymentMethod: PaymentMethod.EFECTIVO_USD,
                            date: new Date().toISOString().split('T')[0],
                            notes: 'Saldado total',
                          });
                          setCalculatorReceived('');
                          setShowAbonoModal(true);
                        }}
                        disabled={!hasDebt}
                        className="py-2.5 px-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle2 size={12} /> Pago Total
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* --- MODAL DE DETALLE DE MOVIMIENTOS --- */}
      <AnimatePresence>
        {showDetailsModal && activeSelectedClient && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowDetailsModal(false)} 
              className="absolute inset-0 bg-brand-dark/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 30 }} 
              className="bg-white w-full max-w-2xl rounded-[3rem] shadow-[0_25px_60px_-15px_rgba(124,58,237,0.3)] relative z-10 border-4 border-white max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 md:p-8 bg-brand-dark text-white relative shrink-0">
                <button 
                  onClick={() => setShowDetailsModal(false)}
                  className="absolute right-6 top-6 p-2 bg-white/10 hover:bg-white/20 transition-all rounded-full"
                >
                  <X size={18} />
                </button>
                
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/10 rounded-3xl flex items-center justify-center text-brand-yellow">
                    <User size={30} />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-black">{activeSelectedClient.clientName}</h3>
                    <p className="text-[9px] font-bold text-purple-200 uppercase tracking-widest leading-none mt-1">Ficha de movimientos acumulados</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-6 text-center">
                  <div className="bg-white/10 p-2.5 rounded-2xl">
                    <div className="text-[8px] text-purple-200 font-black uppercase tracking-wider">Total Fiado</div>
                    <div className="text-lg font-black">${activeSelectedClient.totalDebtUsd.toFixed(2)}</div>
                    <div className="text-[10px] text-purple-200 underline">Bs. {(activeSelectedClient.totalDebtBs).toFixed(1)}</div>
                  </div>
                  <div className="bg-white/10 p-2.5 rounded-2xl">
                    <div className="text-[8px] text-purple-200 font-black uppercase tracking-wider">Abonado</div>
                    <div className="text-lg font-black text-emerald-300">${activeSelectedClient.totalPaidUsd.toFixed(2)}</div>
                    <div className="text-[10px] text-emerald-300 underline">Bs. {(activeSelectedClient.totalPaidBs).toFixed(1)}</div>
                  </div>
                  <div className="bg-white/10 p-2.5 rounded-2xl border-2 border-brand-yellow">
                    <div className="text-[8px] text-brand-yellow font-black uppercase tracking-wider">RESTANTE (DEBE)</div>
                    <div className="text-lg font-extrabold text-brand-yellow">${activeSelectedClient.netPendingUsd.toFixed(2)}</div>
                    <div className="text-[10px] text-brand-yellow underline">Bs. {(activeSelectedClient.netPendingBs).toFixed(1)}</div>
                  </div>
                </div>
              </div>

              {/* Scrollable Body list history */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                <div className="flex justify-between items-center shrink-0 border-b pb-3">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Historial de Transacciones</h4>
                  
                  {activeSelectedClient.netPendingUsd > 0.01 && (
                    <button 
                      onClick={handlePayCompleteBalance}
                      className="px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all"
                    >
                      Saldar Total
                    </button>
                  )}
                </div>

                <div className="relative border-l-2 border-purple-100 pl-6 space-y-6">
                  {clientMovements.map((move, i) => {
                    const isPurchase = move.type === 'purchase';
                    return (
                      <div key={move.id + '-' + i} className="relative">
                        {/* Timeline Circle Bullet Icon */}
                        <span className={`absolute -left-[35px] top-1.5 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white text-white shadow-md
                          ${isPurchase ? 'bg-brand-secondary' : 'bg-emerald-500'}
                        `}>
                          {isPurchase ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                        </span>

                        <div className="bg-brand-bg/50 hover:bg-brand-bg transition-colors p-4 rounded-2xl border border-purple-100/30">
                          {/* Top metadata */}
                          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <Calendar size={10} /> {new Date(move.date).toLocaleString()}
                            </span>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full
                              ${isPurchase ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}
                            `}>
                              {isPurchase ? 'Compra de Productos' : 'Abono / Pago'}
                            </span>
                          </div>

                          {/* Dynamic detailed listing */}
                          <div className="space-y-2 mt-2">
                            {isPurchase && move.items ? (
                              <div className="bg-white rounded-xl p-3 border border-purple-100/30 space-y-2">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block border-b pb-1 mb-1">Productos retirados:</span>
                                {move.items.map((item, idx) => (
                                  <div key={item.id + '-' + idx} className="flex items-center justify-between text-xs py-1.5 border-b border-dashed border-slate-100 last:border-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] bg-purple-50 text-brand-primary px-1.5 py-0.5 rounded-lg font-black">{item.quantity}</span>
                                      <span className="font-extrabold text-slate-700">{item.name}</span>
                                      <span className="text-[9px] text-slate-400">({item.category})</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-black text-slate-800">${item.priceUsd.toFixed(2)} c/u</span>
                                      <span className="text-[9px] text-slate-400 block">Bs. {(item.priceUsd * move.rate).toFixed(2)} c/u</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-800 font-black text-xs md:text-sm leading-relaxed font-semibold">
                                {move.details}
                              </div>
                            )}
                          </div>

                          {/* Currency totals row */}
                          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-purple-100/30">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 block uppercase leading-none">Tasa aplicada</span>
                              <span className="text-[11px] font-black text-slate-500">Bs. {move.rate.toFixed(2)}</span>
                            </div>
                            <div className="text-right">
                              <div className={`font-black text-sm md:text-base ${isPurchase ? 'text-purple-600' : 'text-emerald-600'}`}>
                                {isPurchase ? '+' : '-'} ${move.amountUsd.toFixed(2)}
                              </div>
                              <div className={`text-[10px] font-bold leading-none ${isPurchase ? 'text-purple-400' : 'text-emerald-500'}`}>
                                {isPurchase ? '+' : '-'} Bs. {move.amountBs.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Actions / Void or Delete */}
                          <div className="flex justify-end mt-2">
                            {isPurchase ? (
                              <button 
                                onClick={() => handleDeletePurchase(move.id, move.items || [])}
                                className="text-[9px] text-red-400 hover:text-red-600 font-black uppercase tracking-wider flex items-center gap-1 px-2 py-1 hover:bg-red-50 rounded"
                              >
                                <Trash2 size={10} /> Anular Crédito (Por Error)
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleVoidPayment(move.id)}
                                className="text-[9px] text-red-400 hover:text-red-600 font-black uppercase tracking-wider flex items-center gap-1 px-2 py-1 hover:bg-red-50 rounded"
                              >
                                <Trash2 size={10} /> Anular Abono (Por Error)
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL PARA REGISTRAR ABONO --- */}
      <AnimatePresence>
        {showAbonoModal && activeSelectedClient && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowAbonoModal(false)} 
              className="absolute inset-0 bg-brand-dark/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }} 
              className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative z-10 border-4 border-white p-8 flex flex-col max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                    <Coins size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Registrar Abono</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Acreditar a {activeSelectedClient.clientName}</p>
                  </div>
                </div>
                <button onClick={() => setShowAbonoModal(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {/* Overall warning info details */}
              <div className="mb-6 p-4 rounded-2xl bg-brand-bg/50 border border-purple-100 text-slate-600 text-xs font-medium flex gap-3">
                <Info size={18} className="text-brand-secondary shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold text-brand-dark block uppercase tracking-wider text-[9px] mb-1">Deuda pendiente total:</span>
                  <b>${activeSelectedClient.netPendingUsd.toFixed(2)} USD</b> o <b>{activeSelectedClient.netPendingBs.toFixed(2)} Bs.</b> (Tasa: Bs. {exchangeRate})
                </div>
              </div>

              <form onSubmit={handleSaveAbono} className="space-y-4">
                {/* Convertible input rows */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Monto $ USD</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-sm">$</span>
                      <input 
                        required
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        value={abonoForm.amountUsd}
                        onChange={e => handleUsdChange(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 bg-brand-bg font-extrabold rounded-2xl border border-transparent focus:border-brand-primary text-slate-700 outline-none text-sm text-center" 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Monto Bs.</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-extrabold text-[10px]">Bs</span>
                      <input 
                        required
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        value={abonoForm.amountBs}
                        onChange={e => handleBsChange(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-brand-bg font-extrabold rounded-2xl border border-transparent focus:border-brand-primary text-slate-700 outline-none text-sm text-center" 
                      />
                    </div>
                  </div>
                </div>

                {/* Form controls */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Método de Pago</label>
                  <select 
                    value={abonoForm.paymentMethod}
                    onChange={e => setAbonoForm(prev => ({ ...prev, paymentMethod: e.target.value as PaymentMethod }))}
                    className="w-full px-4 py-3 bg-brand-bg font-semibold rounded-2xl border border-transparent focus:border-brand-primary text-slate-700 outline-none text-sm"
                  >
                    <option value={PaymentMethod.EFECTIVO_USD}>Divisa (Efectivo $)</option>
                    <option value={PaymentMethod.EFECTIVO_BS}>Efectivo (Bolívares)</option>
                    <option value={PaymentMethod.PAGO_MOVIL}>Pago Móvil</option>
                    <option value={PaymentMethod.PUNTO}>Punto de Venta</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Fecha de Pago</label>
                  <input 
                    required
                    type="date" 
                    value={abonoForm.date}
                    onChange={e => setAbonoForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-3 bg-brand-bg font-semibold rounded-2xl border border-transparent focus:border-brand-primary text-slate-700 outline-none text-sm" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Observaciones / Notas (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Transferencia Nro 91823" 
                    value={abonoForm.notes}
                    onChange={e => setAbonoForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-3 bg-brand-bg font-semibold rounded-2xl border border-transparent focus:border-brand-primary text-slate-700 outline-none text-sm" 
                  />
                </div>

                {/* --- CALCULADORA DE VUELTO --- */}
                <div className="bg-brand-bg/60 p-4 rounded-2xl border border-purple-100/30 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-purple-100/20">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">💸 Calculadora de Vuelto</span>
                    <span className="text-[8px] bg-purple-100 text-brand-primary px-2 py-0.5 rounded-full font-black uppercase">Opcional</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase block pl-1">¿Con cuánto cancela?</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        value={calculatorReceived}
                        onChange={e => setCalculatorReceived(e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-purple-100/30 font-extrabold text-slate-700 outline-none text-xs text-center"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase block pl-1">Moneda del Billete</label>
                      <select
                        value={calculatorCurrency}
                        onChange={e => setCalculatorCurrency(e.target.value as 'USD' | 'BS')}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-purple-100/30 font-extrabold text-slate-700 outline-none text-xs cursor-pointer"
                      >
                        <option value="USD">Dólares ($)</option>
                        <option value="BS">Bolívares (Bs)</option>
                      </select>
                    </div>
                  </div>

                  {parseFloat(calculatorReceived) > 0 && (() => {
                    const received = parseFloat(calculatorReceived);
                    const totalToPayUsd = parseFloat(abonoForm.amountUsd) || 0;
                    const totalToPayBs = parseFloat(abonoForm.amountBs) || 0;

                    let changeUsd = 0;
                    let changeBs = 0;

                    if (calculatorCurrency === 'USD') {
                      changeUsd = received - totalToPayUsd;
                      changeBs = changeUsd * exchangeRate;
                    } else {
                      changeBs = received - totalToPayBs;
                      changeUsd = changeBs / exchangeRate;
                    }

                    const isShort = changeUsd < -0.01;

                    return (
                      <div className={`p-2.5 rounded-xl border text-center text-xs ${isShort ? 'bg-red-50 border-red-100 text-red-600' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                        {isShort ? (
                          <span className="text-[9px] font-black uppercase">Monto insuficiente para cubrir el pago</span>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Vuelto a entregar:</span>
                            <div className="flex justify-around items-center pt-1">
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 block uppercase">En USD</span>
                                <span className="text-sm font-black text-brand-dark">${changeUsd.toFixed(2)}</span>
                              </div>
                              <div className="w-px h-5 bg-purple-100/55"></div>
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 block uppercase">En Bs.</span>
                                <span className="text-sm font-black text-emerald-600">Bs. {changeBs.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 font-black text-xs uppercase tracking-widest text-white rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 mt-6 active:scale-95"
                >
                  <CheckCircle2 size={18} /> Registrar y Acreditar Abono
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Internal Clock helper to show beautiful relative date of activities
const ClockAndCalendar: React.FC<{ date: string }> = ({ date }) => {
  const parsed = new Date(date);
  return (
    <>
      <CalendarClock size={12} className="text-brand-pink shrink-0" />
      <span>{parsed.toLocaleDateString()} a las {parsed.toLocaleDateString() === new Date().toLocaleDateString() ? parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : parsed.toLocaleDateString()}</span>
    </>
  );
};

export default Credits;
