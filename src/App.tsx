import React, { useState, useRef } from 'react';
import {
  Shield,
  FileText,
  Upload,
  User,
  Car,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Trash2,
  FileCheck,
  MessageCircle,
  Info,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  ExternalLink,
  Sliders,
  FileUp,
  MessageSquareText,
  PencilLine,
  X,
  LogIn,
  LogOut,
  History,
  BookmarkCheck,
  Lock,
  Bookmark,
} from 'lucide-react';
import { useAuth } from './context/AuthContext.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { SavedComparisonsModal } from './components/SavedComparisonsModal.tsx';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';

interface CoberturasObligatorias {
  colision: boolean;
  robo: boolean;
  asistenciaVial: boolean;
  fenomenosNaturales: boolean;
  vehiculoSustituto: boolean;
}

interface ProposalItem {
  nombreArchivo: string;
  aseguradora: string;
  primaAnual: string;
  primaAnualNumerica?: number;
  cabeEnPresupuesto: string;
  deducibleColision: string;
  deducibleRobo: string;
  rcDanosTerceros: string;
  rcLesiones: string;
  asistenciaVial: string;
  grua: string;
  vehiculoSustituto: string;
  fenomenosNaturales: string;
  roturaCristales: string;
  exclusionesDestacadas: string;
  cumpleObligatorias: string;
  semaforo: 'verde' | 'amarillo' | 'rojo' | string;
  justificacionSemaforo?: string;
}

interface ComparisonResult {
  aseguradoras: ProposalItem[];
  recomendacionPreliminar: string;
  mensajeWhatsApp: string;
}

interface UploadedFile {
  name: string;
  size: number;
  mimeType: string;
  base64: string;
}

export default function App() {
  const { currentUser, userProfile, isAdmin, loading: authLoading, loginWithGoogle, logout } = useAuth();
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // State for files
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for client profile
  const [nombre, setNombre] = useState('Laura Solís Vargas');
  const [vehiculo, setVehiculo] = useState('Toyota Corolla XEi 2022 · Particular');
  const [presupuesto, setPresupuesto] = useState('400000');
  const [formaPago, setFormaPago] = useState('Mensual en cuotas');
  const [prioridades, setPrioridades] = useState(
    'Busco buen balance de costo anual pero es indispensable contar con asistencia vial confiable en carretera y deducibles razonables.'
  );
  const [coberturas, setCoberturas] = useState<CoberturasObligatorias>({
    colision: true,
    robo: true,
    asistenciaVial: true,
    fenomenosNaturales: false,
    vehiculoSustituto: false,
  });

  // State for loading, error, and result
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // State for editing client profile via pasted message or PDF
  const [importMode, setImportMode] = useState<'none' | 'message' | 'pdf'>('none');
  const [pastedMessage, setPastedMessage] = useState('');
  const [clientPdf, setClientPdf] = useState<{ name: string; size: number; base64: string } | null>(null);
  const [isExtractingProfile, setIsExtractingProfile] = useState(false);
  const [extractSuccessMsg, setExtractSuccessMsg] = useState<string | null>(null);
  const [extractErrorMsg, setExtractErrorMsg] = useState<string | null>(null);
  const clientPdfInputRef = useRef<HTMLInputElement>(null);

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const res = reader.result as string;
        // Strip data:...;base64, prefix
        const base64Data = res.split(',')[1] || '';
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle files upload
  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setErrorMsg(null);

    const pdfs: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push(f);
      }
    }

    if (pdfs.length === 0) {
      setErrorMsg('Por favor selecciona únicamente archivos en formato PDF.');
      return;
    }

    const availableSlots = 3 - uploadedFiles.length;
    if (availableSlots <= 0) {
      setErrorMsg('Ya has alcanzado el límite de 3 propuestas.');
      return;
    }

    const toProcess = pdfs.slice(0, availableSlots);
    if (pdfs.length > availableSlots) {
      setErrorMsg(`Solo se pueden comparar hasta 3 propuestas a la vez. Se agregaron las primeras ${availableSlots}.`);
    }

    const newUploaded: UploadedFile[] = [];
    for (const file of toProcess) {
      try {
        const base64 = await fileToBase64(file);
        newUploaded.push({
          name: file.name,
          size: file.size,
          mimeType: 'application/pdf',
          base64,
        });
      } catch (err) {
        console.error('Error reading file:', err);
      }
    }

    setUploadedFiles((prev) => [...prev, ...newUploaded]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle client PDF upload for editing profile
  const handleClientPdfUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setExtractErrorMsg('Por favor selecciona un archivo PDF válido.');
      return;
    }

    try {
      setExtractErrorMsg(null);
      const base64 = await fileToBase64(file);
      setClientPdf({
        name: file.name,
        size: file.size,
        base64,
      });
    } catch (err: any) {
      setExtractErrorMsg('Error al leer el archivo PDF: ' + err.message);
    }
  };

  // Trigger Gemini extraction for client profile
  const handleExtractProfile = async (type: 'message' | 'pdf') => {
    setExtractErrorMsg(null);
    setExtractSuccessMsg(null);

    if (type === 'message' && !pastedMessage.trim()) {
      setExtractErrorMsg('Por favor pega el mensaje de WhatsApp o texto antes de extraer.');
      return;
    }

    if (type === 'pdf' && !clientPdf) {
      setExtractErrorMsg('Por favor selecciona un archivo PDF antes de extraer.');
      return;
    }

    setIsExtractingProfile(true);

    try {
      const payload: any = {};
      if (type === 'message') {
        payload.text = pastedMessage.trim();
      } else if (type === 'pdf' && clientPdf) {
        payload.pdfBase64 = clientPdf.base64;
        payload.mimeType = 'application/pdf';
        payload.fileName = clientPdf.name;
      }

      const res = await fetch('/api/extract-client-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo extraer la información del perfil.');
      }

      const prof = data.profile;
      if (prof) {
        if (prof.nombre) setNombre(prof.nombre);
        if (prof.vehiculo) setVehiculo(prof.vehiculo);
        if (prof.presupuesto) setPresupuesto(String(prof.presupuesto));
        if (prof.prioridades) setPrioridades(prof.prioridades);
        if (prof.formaPago) setFormaPago(prof.formaPago);
        if (prof.coberturasObligatorias) {
          setCoberturas({
            colision: Boolean(prof.coberturasObligatorias.colision),
            robo: Boolean(prof.coberturasObligatorias.robo),
            asistenciaVial: Boolean(prof.coberturasObligatorias.asistenciaVial),
            fenomenosNaturales: Boolean(prof.coberturasObligatorias.fenomenosNaturales),
            vehiculoSustituto: Boolean(prof.coberturasObligatorias.vehiculoSustituto),
          });
        }

        setExtractSuccessMsg('¡Perfil actualizado con éxito! Puedes revisar o afinar cualquier dato abajo.');
        setImportMode('none');
        setTimeout(() => setExtractSuccessMsg(null), 5000);
      }
    } catch (err: any) {
      setExtractErrorMsg(err.message || 'Error al autocompletar el perfil.');
    } finally {
      setIsExtractingProfile(false);
    }
  };

  const loadSampleWhatsAppMessage = () => {
    setPastedMessage(
      'Hola estimado asesor, soy don Carlos Mora Valverde (cédula 1-1234-0567). Deseo cotizar seguro para mi Toyota Hilux 2023 de uso particular. Mi presupuesto máximo es de unos ₡ 450.000 al año y prefiero pagar en cuotas mensuales. Para mí es indispensable contar con colisión, robo total/parcial y asistencia vial 24/7 con buena grúa porque viajo con frecuencia a zonas rurales. Si incluye vehículo sustituto sería genial. Priorizo deducibles razonables y excelente respaldo.'
    );
  };

  // Load sample proposals provided in workspace
  const loadSampleProposals = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/sample-proposals');
      const data = await res.json();

      if (data.success && data.files) {
        setUploadedFiles(data.files);
        if (data.sampleProfile) {
          setNombre(data.sampleProfile.nombre);
          setVehiculo(data.sampleProfile.vehiculo);
          setPresupuesto(String(data.sampleProfile.presupuesto));
          setCoberturas(data.sampleProfile.coberturasObligatorias);
          setPrioridades(data.sampleProfile.prioridades);
          setFormaPago(data.sampleProfile.formaPago);
        }
      } else {
        setErrorMsg('No se pudieron cargar las propuestas de ejemplo.');
      }
    } catch (err: any) {
      setErrorMsg('Error al obtener propuestas de ejemplo: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Format colones currency helper
  const formatColones = (numStr: string) => {
    const clean = numStr.replace(/\D/g, '');
    if (!clean) return '';
    return Number(clean).toLocaleString('es-CR');
  };

  // Submit comparison
  const handleCompare = async () => {
    if (uploadedFiles.length === 0) {
      setErrorMsg('Debes subir de 1 a 3 propuestas en PDF para iniciar la comparación.');
      return;
    }

    const numPresupuesto = Number(presupuesto.replace(/\D/g, '')) || 0;
    if (numPresupuesto <= 0) {
      setErrorMsg('Por favor ingresa un presupuesto anual válido en colones.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setLoadingStep(1);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1800);

    try {
      const payload = {
        files: uploadedFiles,
        profile: {
          nombre: nombre.trim() || 'Cliente particular',
          vehiculo: vehiculo.trim() || 'Vehículo particular',
          presupuesto: numPresupuesto,
          coberturasObligatorias: coberturas,
          prioridades: prioridades.trim(),
          formaPago: formaPago.trim(),
        },
      };

      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ocurrió un error al procesar las propuestas con Gemini.');
      }

      setResult(data.result);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error inesperado durante la comparación.');
    } finally {
      clearInterval(stepInterval);
      setIsLoading(false);
      setLoadingStep(0);
    }
  };

  // Copy WhatsApp message to clipboard
  const handleCopyMessage = () => {
    if (!result?.mensajeWhatsApp) return;
    navigator.clipboard.writeText(result.mensajeWhatsApp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Reset for new comparison
  const handleNewComparison = () => {
    setResult(null);
    setUploadedFiles([]);
    setErrorMsg(null);
    setSaveSuccessMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save comparison to production Firestore database
  const handleSaveComparison = async () => {
    if (!result || !currentUser) return;
    setIsSavingRecord(true);
    setSaveSuccessMsg(null);
    try {
      const compId = 'comp_' + Date.now();
      const numPresupuesto = Number(presupuesto.replace(/\D/g, '')) || 0;
      const newDoc = {
        id: compId,
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        clientName: nombre || 'Cliente particular',
        vehicle: vehiculo || 'Vehículo particular',
        budget: numPresupuesto,
        proposalsCount: result.aseguradoras.length,
        recommendation: result.recomendacionPreliminar,
        whatsappMessage: result.mensajeWhatsApp,
        proposalsSummary: JSON.stringify(result.aseguradoras),
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'comparisons', compId), newDoc);

      // Log audit
      try {
        await addDoc(collection(db, 'audit_logs'), {
          id: 'log_' + Date.now(),
          action: 'COMPARISON_SAVED',
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          details: `Comparación guardada para ${nombre} (${result.aseguradoras.length} cotizaciones)`,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Audit write error:', e);
      }

      setSaveSuccessMsg('¡Comparación guardada exitosamente en el historial seguro!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'comparisons');
    } finally {
      setIsSavingRecord(false);
    }
  };

  // Restore saved comparison into view
  const handleSelectSavedComparison = (saved: any) => {
    setNombre(saved.clientName || '');
    setVehiculo(saved.vehicle || '');
    setPresupuesto(String(saved.budget || '400000'));
    try {
      const aseguradoras = JSON.parse(saved.proposalsSummary || '[]');
      setResult({
        aseguradoras,
        recomendacionPreliminar: saved.recommendation || '',
        mensajeWhatsApp: saved.whatsappMessage || '',
      });
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (e) {
      console.error('Error parsing saved proposals summary:', e);
    }
  };

  // Helper to render semaforo pill
  const renderSemaforo = (color: string) => {
    const c = color.toLowerCase();
    if (c === 'verde') {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-xs tracking-wide shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          VERDE
        </div>
      );
    }
    if (c === 'amarillo') {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs tracking-wide shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          AMARILLO
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-semibold text-xs tracking-wide shadow-xs">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
        ROJO
      </div>
    );
  };

  // Helper for Yes / No badges in table
  const renderBoolBadge = (value: string, positiveExpected: boolean = true) => {
    const isYes = value?.trim().toLowerCase().startsWith('s');
    const isPositive = positiveExpected ? isYes : !isYes;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
          isPositive
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}
      >
        {isYes ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
        {value || 'No indicado'}
      </span>
    );
  };

  // Screen while checking auth session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-[#002B49] text-white flex items-center justify-center shadow-lg mb-4">
          <Shield className="w-8 h-8 text-emerald-400" />
        </div>
        <div className="flex items-center gap-2 text-slate-700 text-sm font-semibold">
          <Loader2 className="w-5 h-5 animate-spin text-[#002B49]" />
          <span>Verificando credenciales de seguridad...</span>
        </div>
      </div>
    );
  }

  // Production Login Screen if unauthenticated
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-[#002B49] text-white px-6 py-4 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Comparador de Propuestas BN</h1>
              <p className="text-xs text-slate-300">BN Corredora de Seguros · Costa Rica</p>
            </div>
          </div>
          <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full font-semibold">
            Entorno Seguro de Producción
          </span>
        </header>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-[#002B49]/10 text-[#002B49] mx-auto flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-900">Acceso Autenticado</h2>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Este sistema opera en producción con control de usuarios y registro de auditoría. Por favor inicia sesión con tu cuenta corporativa.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-left text-xs border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Políticas de Seguridad Activas:</span>
              </div>
              <ul className="space-y-1 text-slate-600 pl-4 list-disc text-[11px]">
                <li>Control de acceso basado en roles (Administrador y Asesores).</li>
                <li>Auditoría inmutable de accesos y cotizaciones en Firestore.</li>
                <li>Reglas de seguridad endurecidas contra manipulación de datos.</li>
              </ul>
            </div>

            <button
              onClick={() => loginWithGoogle().catch((e) => setErrorMsg(e.message))}
              className="w-full py-3 px-4 rounded-xl bg-[#002B49] hover:bg-[#0B3A63] text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-3 cursor-pointer hover:shadow-lg active:scale-[0.99]"
            >
              <LogIn className="w-5 h-5 text-amber-400" />
              <span>Iniciar sesión con Google corporativo</span>
            </button>

            <p className="text-[11px] text-slate-400">
              Administrador inicial configurado: <strong className="text-slate-600">oscar.fundepos@gmail.com</strong>
            </p>
          </div>
        </div>

        <footer className="py-3 text-center text-xs text-slate-400 bg-white border-t border-slate-200">
          BN Corredora de Seguros · Todos los derechos reservados · Costa Rica
        </footer>
      </div>
    );
  }

  // Account Suspended Screen
  if (userProfile?.status === 'suspended') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-200 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Acceso Suspendido</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Tu cuenta de usuario ha sido suspendida por el administrador de BN Corredora de Seguros. No tienes autorización para realizar cotizaciones en este momento.
          </p>
          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs transition cursor-pointer"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-[#002B49] selection:text-white">
      {/* Top Banner / Navigation */}
      <header className="bg-[#002B49] text-white border-b border-[#0B3A63] shadow-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Comparador de Propuestas BN
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Costa Rica
                </span>
              </div>
              <p className="text-xs text-slate-300 font-normal">
                Compara propuestas de seguro de automóvil en minutos. La IA prepara, el asesor decide.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
            {/* Quick Demo button */}
            <button
              type="button"
              onClick={loadSampleProposals}
              className="text-xs font-medium bg-[#0B3A63] hover:bg-[#134D80] text-emerald-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/15 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Cargar los 3 documentos de ejemplo de Cordillera, Alborada y Protectora del Valle"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Casos de prueba</span>
            </button>

            {/* Saved comparisons button */}
            <button
              type="button"
              onClick={() => setIsSavedModalOpen(true)}
              className="text-xs font-medium bg-[#0B3A63] hover:bg-[#134D80] text-white px-2.5 py-1.5 rounded-lg border border-white/15 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Ver mis comparaciones guardadas en producción"
            >
              <History className="w-3.5 h-3.5 text-blue-300" />
              <span>Historial</span>
            </button>

            {/* Admin Console trigger */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsAdminPanelOpen(true)}
                className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                title="Abrir consola de administración y control de usuarios"
              >
                <ShieldCheck className="w-4 h-4 text-slate-950" />
                <span>Panel Admin</span>
              </button>
            )}

            {/* User Profile Badge & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="" className="w-7 h-7 rounded-full border border-white/30" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-bold">
                  {currentUser.displayName?.charAt(0) || 'U'}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-bold text-white leading-tight truncate max-w-[130px]">
                  {currentUser.displayName || currentUser.email}
                </p>
                <span
                  className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                    userProfile?.role === 'admin'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-blue-300 text-blue-950'
                  }`}
                >
                  {userProfile?.role === 'admin' ? 'ADMIN' : 'ASESOR'}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-white/10 rounded-lg transition cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 pb-28">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Atención</p>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* SECTION 1: PROPUESTAS (PDF UPLOAD) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <section className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 sm:p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Propuestas
                  </h2>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {uploadedFiles.length} de 3 cargadas
                </span>
              </div>

              <p className="text-xs text-slate-600 mb-4">
                Sube de 1 a 3 cotizaciones oficiales en PDF (una por aseguradora). Gemini extraerá con precisión los deducibles, asistencias y primas.
              </p>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-[#002B49] hover:bg-slate-50/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <div className="w-12 h-12 rounded-full bg-[#002B49]/5 text-[#002B49] mx-auto flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-[#002B49]" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Arrastra tus cotizaciones en PDF aquí
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  o haz clic para explorar archivos (máx. 3 PDF)
                </p>
              </div>

              {/* Uploaded Files List */}
              <div className="mt-4 space-y-2">
                {uploadedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs transition hover:border-slate-300"
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <div className="w-7 h-7 rounded bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          PDF • {(file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                      title="Eliminar archivo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {uploadedFiles.length === 0 && (
                  <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200/70 text-amber-800 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Sin propuestas cargadas aún.</span>
                    </div>
                    <button
                      type="button"
                      onClick={loadSampleProposals}
                      className="underline font-semibold hover:text-amber-900 cursor-pointer shrink-0"
                    >
                      Cargar 3 ejemplos
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Quick Helper Box for Advisor */}
            <div className="bg-slate-100/80 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Sliders className="w-4 h-4 text-[#002B49]" />
                <span>Reglas del semáforo:</span>
              </div>
              <ul className="space-y-1 pl-5 list-disc text-slate-600">
                <li><strong className="text-emerald-700">Verde:</strong> Cabe en presupuesto y cumple todas las coberturas obligatorias.</li>
                <li><strong className="text-amber-700">Amarillo:</strong> Cumple coberturas obligatorias pero excede el presupuesto.</li>
                <li><strong className="text-rose-700">Rojo:</strong> No cumple alguna cobertura obligatoria (los paquetes opcionales con costo extra no cuentan).</li>
              </ul>
            </div>
          </div>

          {/* SECTION 2: PERFIL DEL CLIENTE */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <section className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 sm:p-6 flex-1 flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      Perfil del cliente
                    </h2>
                  </div>
                </div>

                {/* Quick actions to edit profile via PDF or Message */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode((prev) => (prev === 'message' ? 'none' : 'message'));
                      setExtractErrorMsg(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                      importMode === 'message'
                        ? 'bg-[#002B49] text-white border-[#002B49]'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                    title="Autocompletar o editar el perfil pegando un mensaje de WhatsApp o texto"
                  >
                    <MessageSquareText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pegar mensaje</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setImportMode((prev) => (prev === 'pdf' ? 'none' : 'pdf'));
                      setExtractErrorMsg(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                      importMode === 'pdf'
                        ? 'bg-[#002B49] text-white border-[#002B49]'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                    title="Autocompletar o editar el perfil subiendo una solicitud o PDF del cliente"
                  >
                    <FileUp className="w-3.5 h-3.5 text-blue-600" />
                    <span>Subir PDF</span>
                  </button>
                </div>
              </div>

              {/* Status Alert for Profile Extraction */}
              {extractSuccessMsg && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{extractSuccessMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExtractSuccessMsg(null)}
                    className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {extractErrorMsg && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{extractErrorMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExtractErrorMsg(null)}
                    className="text-rose-700 hover:text-rose-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* EXPANDABLE PANEL: EDIT VIA PASTED MESSAGE */}
              {importMode === 'message' && (
                <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-emerald-200 shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Pegar mensaje del cliente (WhatsApp, correo o notas)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImportMode('none')}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Pega el texto tal cual lo envió el cliente. Gemini identificará su nombre, vehículo, presupuesto anual y coberturas prioritarias para rellenar el formulario.
                  </p>
                  <textarea
                    rows={4}
                    value={pastedMessage}
                    onChange={(e) => setPastedMessage(e.target.value)}
                    placeholder="Ejemplo: 'Hola, soy doña Gabriela Vargas. Necesito cotizar seguro para un Toyota RAV4 2023 particular. Mi presupuesto anual es de ₡420.000 y prefiero pagar mensual. Me urge que incluya colisión, robo y asistencia 24/7 con grúa...'"
                    className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                  />
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={loadSampleWhatsAppMessage}
                      className="text-[11px] text-emerald-700 hover:underline font-semibold cursor-pointer"
                    >
                      Pegar mensaje de ejemplo de WhatsApp
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setImportMode('none')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExtractProfile('message')}
                        disabled={isExtractingProfile || !pastedMessage.trim()}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                          isExtractingProfile || !pastedMessage.trim()
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        }`}
                      >
                        {isExtractingProfile ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Extrayendo con IA...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Extraer y actualizar perfil</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EXPANDABLE PANEL: EDIT VIA CLIENT PDF */}
              {importMode === 'pdf' && (
                <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-blue-200 shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileUp className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Subir PDF del cliente (solicitud, ficha o cotización previa)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImportMode('none')}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Sube un documento PDF con los datos del cliente o vehículo. Gemini extraerá automáticamente los campos correspondientes.
                  </p>

                  <input
                    ref={clientPdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => handleClientPdfUpload(e.target.files)}
                  />

                  {clientPdf ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-blue-200 text-xs mb-3">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="truncate">
                          <p className="font-semibold text-slate-800 truncate">{clientPdf.name}</p>
                          <p className="text-[10px] text-slate-500">{(clientPdf.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setClientPdf(null)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Quitar archivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => clientPdfInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-4 text-center cursor-pointer bg-white mb-3 transition"
                    >
                      <Upload className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                      <p className="text-xs font-semibold text-slate-700">Seleccionar documento PDF del cliente</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Ficha de solicitud o formulario de datos</p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode('none')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtractProfile('pdf')}
                      disabled={isExtractingProfile || !clientPdf}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                        isExtractingProfile || !clientPdf
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                      }`}
                    >
                      {isExtractingProfile ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Extrayendo con IA...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Extraer y actualizar perfil</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Nombre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nombre del cliente
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej. Laura Solís Vargas"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] focus:border-[#002B49]"
                    />
                  </div>
                </div>

                {/* Vehículo y uso */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Vehículo y uso
                  </label>
                  <div className="relative">
                    <Car className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={vehiculo}
                      onChange={(e) => setVehiculo(e.target.value)}
                      placeholder="Ej. Toyota Corolla XEi 2022, Particular"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] focus:border-[#002B49]"
                    />
                  </div>
                </div>

                {/* Presupuesto máximo anual */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Presupuesto máximo anual (colones ₡)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-bold text-slate-400 text-sm">
                      ₡
                    </span>
                    <input
                      type="text"
                      value={formatColones(presupuesto)}
                      onChange={(e) => setPresupuesto(e.target.value.replace(/\D/g, ''))}
                      placeholder="400.000"
                      className="w-full pl-8 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] focus:border-[#002B49]"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Criterio estricto: la prima anual debe ser menor o igual a este monto.
                  </p>
                </div>

                {/* Forma de pago preferida */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Forma de pago preferida
                  </label>
                  <select
                    value={formaPago}
                    onChange={(e) => setFormaPago(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] focus:border-[#002B49] bg-white"
                  >
                    <option value="Mensual en cuotas">Mensual en cuotas</option>
                    <option value="Anual de contado">Anual de contado</option>
                    <option value="Semestral en 2 cuotas">Semestral en 2 cuotas</option>
                    <option value="Trimestral">Trimestral</option>
                  </select>
                </div>
              </div>

              {/* Coberturas obligatorias (checkboxes) */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Coberturas obligatorias marcadas por el cliente:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {[
                    { key: 'colision', label: 'Colisión y vuelco' },
                    { key: 'robo', label: 'Robo total/parcial' },
                    { key: 'asistenciaVial', label: 'Asistencia vial 24/7' },
                    { key: 'fenomenosNaturales', label: 'Fenómenos naturales' },
                    { key: 'vehiculoSustituto', label: 'Vehículo sustituto' },
                  ].map((item) => {
                    const isChecked = coberturas[item.key as keyof CoberturasObligatorias];
                    return (
                      <label
                        key={item.key}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-[#002B49]/5 border-[#002B49] text-[#002B49]'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setCoberturas((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 rounded text-[#002B49] focus:ring-[#002B49] border-slate-300 accent-[#002B49]"
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  * Si alguna cobertura marcada no está incluida en la prima básica, la propuesta no cumple obligatorias (Semáforo Rojo).
                </p>
              </div>

              {/* Prioridades */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Prioridades y observaciones del cliente
                </label>
                <textarea
                  rows={2}
                  value={prioridades}
                  onChange={(e) => setPrioridades(e.target.value)}
                  placeholder="Ej. Prioriza deducibles bajos y buena grúa en caso de viaje fuera de San José..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] focus:border-[#002B49]"
                />
              </div>

              {/* BOTÓN COMPARAR PROPUESTAS */}
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  onClick={handleCompare}
                  disabled={isLoading || uploadedFiles.length === 0}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer ${
                    isLoading || uploadedFiles.length === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-[#002B49] hover:bg-[#0B3A63] text-white active:scale-[0.99] hover:shadow-lg'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                      <span>Analizando propuestas...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-amber-400" />
                      <span>Comparar propuestas ({uploadedFiles.length})</span>
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* LOADING INDICATOR OVERLAY / CARD */}
        {isLoading && (
          <div className="mt-8 p-6 sm:p-8 rounded-xl bg-white border border-slate-200 shadow-md text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#002B49]/10 mb-4">
              <Loader2 className="w-8 h-8 text-[#002B49] animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Analizando propuestas...
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
              Gemini está leyendo los documentos PDF oficiales, verificando deducibles, asistencias, presupuesto y calculando los semáforos de decisión.
            </p>

            <div className="max-w-md mx-auto bg-slate-50 p-4 rounded-lg border border-slate-200 text-left space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-slate-700">Lectura de pólizas y condiciones particulares</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${loadingStep >= 2 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className={loadingStep >= 2 ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  Comprobando coberturas obligatorias marcadas
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${loadingStep >= 3 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className={loadingStep >= 3 ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  Cálculo de semáforo según presupuesto (₡{formatColones(presupuesto)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${loadingStep >= 4 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className={loadingStep >= 4 ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  Redacción de recomendación y mensaje de WhatsApp
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: RESULTADO */}
        {result && (
          <div ref={resultRef} className="mt-10 space-y-8 animate-in fade-in duration-300">
            {/* Header section 3 */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                      Resultado: Tabla comparativa
                    </h2>
                    <p className="text-xs text-slate-500">
                      Comparativa estructurada de {result.aseguradoras.length} propuesta(s) para {nombre}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNewComparison}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Nueva comparación</span>
                  </button>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="overflow-x-auto mt-4 rounded-lg border border-slate-200 shadow-xs">
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-[#002B49] text-white divide-x divide-[#0B3A63]">
                      <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] sm:text-xs min-w-[190px] w-1/4">
                        Criterio / Cobertura
                      </th>
                      {result.aseguradoras.map((item, idx) => (
                        <th key={idx} className="p-3.5 font-bold text-left min-w-[220px]">
                          <div className="text-xs text-slate-300 font-normal truncate">
                            {item.nombreArchivo}
                          </div>
                          <div className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                            {item.aseguradora}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* 1. Prima anual */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        1. Prima anual
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 font-bold text-slate-950 text-sm">
                          {item.primaAnual}
                        </td>
                      ))}
                    </tr>

                    {/* 2. Cabe en presupuesto */}
                    <tr className="bg-slate-50 hover:bg-slate-100/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-100/60">
                        2. Cabe en presupuesto
                        <span className="block text-[10px] text-slate-500 font-normal">
                          (Máx. ₡{formatColones(presupuesto)})
                        </span>
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3">
                          {renderBoolBadge(item.cabeEnPresupuesto)}
                        </td>
                      ))}
                    </tr>

                    {/* 3. Deducible colisión */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        3. Deducible colisión
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.deducibleColision}
                        </td>
                      ))}
                    </tr>

                    {/* 4. Deducible robo */}
                    <tr className="bg-slate-50 hover:bg-slate-100/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-100/60">
                        4. Deducible robo
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.deducibleRobo}
                        </td>
                      ))}
                    </tr>

                    {/* 5. RC daños a terceros */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        5. RC daños a terceros
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700 font-medium">
                          {item.rcDanosTerceros}
                        </td>
                      ))}
                    </tr>

                    {/* 6. RC lesiones */}
                    <tr className="bg-slate-50 hover:bg-slate-100/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-100/60">
                        6. RC lesiones
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700 font-medium">
                          {item.rcLesiones}
                        </td>
                      ))}
                    </tr>

                    {/* 7. Asistencia vial 24/7 */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        7. Asistencia vial 24/7
                        {coberturas.asistenciaVial && (
                          <span className="block text-[10px] text-amber-700 font-bold">
                            * Obligatoria
                          </span>
                        )}
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.asistenciaVial}
                        </td>
                      ))}
                    </tr>

                    {/* 8. Grúa */}
                    <tr className="bg-slate-50 hover:bg-slate-100/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-100/60">
                        8. Grúa
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.grua}
                        </td>
                      ))}
                    </tr>

                    {/* 9. Vehículo sustituto */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        9. Vehículo sustituto
                        {coberturas.vehiculoSustituto && (
                          <span className="block text-[10px] text-amber-700 font-bold">
                            * Obligatoria
                          </span>
                        )}
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.vehiculoSustituto}
                        </td>
                      ))}
                    </tr>

                    {/* 10. Fenómenos naturales */}
                    <tr className="bg-slate-50 hover:bg-slate-100/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-100/60">
                        10. Fenómenos naturales
                        {coberturas.fenomenosNaturales && (
                          <span className="block text-[10px] text-amber-700 font-bold">
                            * Obligatoria
                          </span>
                        )}
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.fenomenosNaturales}
                        </td>
                      ))}
                    </tr>

                    {/* 11. Rotura de cristales */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        11. Rotura de cristales
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-700">
                          {item.roturaCristales}
                        </td>
                      ))}
                    </tr>

                    {/* 12. Exclusiones destacadas */}
                    <tr className="bg-slate-50 hover:bg-slate-100/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-100/60">
                        12. Exclusiones destacadas
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3 text-slate-600 text-xs leading-relaxed">
                          {item.exclusionesDestacadas}
                        </td>
                      ))}
                    </tr>

                    {/* 13. Cumple obligatorias */}
                    <tr className="bg-white hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                        13. Cumple obligatorias
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-3">
                          {renderBoolBadge(item.cumpleObligatorias)}
                        </td>
                      ))}
                    </tr>

                    {/* 14. Semáforo */}
                    <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
                      <td className="p-4 font-bold text-slate-950 bg-slate-200/70">
                        14. Semáforo
                      </td>
                      {result.aseguradoras.map((item, idx) => (
                        <td key={idx} className="p-4 align-top">
                          <div className="space-y-1.5">
                            {renderSemaforo(item.semaforo)}
                            {item.justificacionSemaforo && (
                              <p className="text-[11px] font-normal text-slate-600 leading-tight">
                                {item.justificacionSemaforo}
                              </p>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* TWO BOTTOM BOXES: RECOMENDACIÓN & MENSAJE WHATSAPP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Box 1: Recomendación preliminar (borrador) */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Recomendación preliminar (borrador)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Una sola propuesta justificada en máx. 5 líneas con montos
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100 text-slate-800 text-sm leading-relaxed flex-1 whitespace-pre-line">
                  {result.recomendacionPreliminar}
                </div>
              </div>

              {/* Box 2: Mensaje sugerido para el cliente (WhatsApp) */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 sm:p-6 flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Mensaje sugerido para el cliente (WhatsApp)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Máximo 8 líneas • Tono cordial • Sin tecnicismos ni plazos
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar mensaje</span>
                      </>
                    )}
                  </button>
                </div>

                {/* WhatsApp Chat Bubble Mockup */}
                <div className="p-4 rounded-lg bg-[#EFEAE2] border border-[#DDD5CA] flex-1 flex flex-col justify-between">
                  <div className="bg-white p-3.5 rounded-lg rounded-tl-none shadow-xs text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed font-sans border border-slate-200/50">
                    {result.mensajeWhatsApp}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-300/40">
                    <span>Listo para enviar al cliente</span>
                    {result.mensajeWhatsApp && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(result.mensajeWhatsApp)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
                      >
                        Abrir en WhatsApp <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Save to Production Success Message */}
            {saveSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <BookmarkCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSavedModalOpen(true)}
                  className="underline text-emerald-700 hover:text-emerald-900 cursor-pointer"
                >
                  Ver en Historial
                </button>
              </div>
            )}

            {/* Action Bar Bottom */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveComparison}
                disabled={isSavingRecord}
                className="px-4 py-2.5 rounded-xl bg-[#002B49] hover:bg-[#0B3A63] text-white font-semibold text-xs sm:text-sm shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingRecord ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Guardando en Firestore...</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4 text-amber-400" />
                    <span>Guardar en producción</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyMessage}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>Copiar mensaje para WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleNewComparison}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs sm:text-sm shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Nueva comparación</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Admin Management Modal */}
      <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} />

      {/* Saved Comparisons Modal */}
      <SavedComparisonsModal
        isOpen={isSavedModalOpen}
        onClose={() => setIsSavedModalOpen(false)}
        onSelectComparison={handleSelectSavedComparison}
      />

      {/* TEXTO FIJO AL PIE (OBLIGATORIO) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900 text-slate-200 border-t border-slate-800 px-4 py-2.5 z-40 shadow-lg text-center backdrop-blur-md bg-slate-900/95">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 text-[11px] sm:text-xs">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-medium text-slate-300">
            Borrador generado con IA. Debe ser validado por un asesor contra las condiciones reales de la póliza. No suba datos reales de clientes.
          </span>
        </div>
      </footer>
    </div>
  );
}
