
import React, { useEffect, useRef } from 'react';
import { X, Camera } from 'lucide-react';

interface ScannerModalProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    // Check if Html5QrcodeScanner is loaded
    if (!(window as any).Html5QrcodeScanner) {
      alert("Error: Librería de escáner no cargada. Recarga la página.");
      onClose();
      return;
    }

    const scanner = new (window as any).Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
      },
      false
    );

    scannerRef.current = scanner;

    scanner.render(
      (decodedText: string) => {
        onScan(decodedText);
        // We close/clear handled by parent usually, but we can clear here too
        scanner.clear().catch(console.error);
        onClose();
      },
      (error: any) => {
        // Ignore scan errors as they happen frequently while searching for a code
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-[2.5rem] p-6 w-full max-w-md relative border-4 border-white shadow-2xl">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500 transition-colors z-10"
        >
          <X size={20} />
        </button>
        
        <div className="text-center mb-6">
           <div className="w-12 h-12 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-2 text-brand-primary">
             <Camera size={24} />
           </div>
           <h3 className="text-xl font-bold text-slate-800">Escanear Código</h3>
           <p className="text-sm text-slate-400">Apunta la cámara al código de barras</p>
        </div>

        <div className="overflow-hidden rounded-2xl border-2 border-dashed border-brand-border bg-black">
           <div id="reader" className="w-full"></div>
        </div>
        
        <p className="text-center text-xs text-slate-400 mt-4 font-semibold">
           Si no funciona, verifica los permisos de tu cámara.
        </p>
      </div>
    </div>
  );
};

export default ScannerModal;
