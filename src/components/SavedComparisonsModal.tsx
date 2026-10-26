import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Trash2,
  ExternalLink,
  X,
  Calendar,
  DollarSign,
  Car,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SavedComparisonsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectComparison: (comparison: any) => void;
}

export const SavedComparisonsModal: React.FC<SavedComparisonsModalProps> = ({
  isOpen,
  onClose,
  onSelectComparison,
}) => {
  const { user, isAdmin } = useAuth();
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadComparisons = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/comparaciones');
      if (!res.ok) {
        throw new Error('Error al consultar comparaciones');
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.comparisons)) {
        setComparisons(data.comparisons);
      } else {
        setComparisons([]);
      }
    } catch (err: any) {
      console.error('Error fetching comparisons:', err);
      setError('No se pudieron cargar las comparaciones guardadas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadComparisons();
    }
  }, [isOpen, user]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Estás seguro de eliminar este registro histórico?')) return;
    try {
      setDeleteId(id);
      const res = await fetch(`/api/comparaciones/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo eliminar el registro');
      }
      setComparisons((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.message || 'Error al eliminar la comparación');
    } finally {
      setDeleteId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#002B49] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Mis comparaciones guardadas</h2>
              <p className="text-xs text-slate-300">
                {isAdmin ? 'Historial de cotizaciones de la corredora' : 'Historial de cotizaciones generadas por tu usuario'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg mb-2">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-[#002B49] mb-2" />
              <p className="text-xs">Cargando comparaciones...</p>
            </div>
          ) : comparisons.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">No hay comparaciones guardadas aún</p>
              <p className="text-xs text-slate-400 mt-1">
                Cuando compares propuestas, podrás guardarlas en el servidor de forma segura.
              </p>
            </div>
          ) : (
            comparisons.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  onSelectComparison(c);
                  onClose();
                }}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-[#002B49] hover:shadow-md transition cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-[#002B49] transition">
                      {c.clientName || 'Cliente particular'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {c.proposalsCount} propuestas
                    </span>
                    {isAdmin && c.usuario && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                        Por: @{c.usuario}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Car className="w-3.5 h-3.5 text-slate-400" />
                      {c.vehicle || 'Vehículo'}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-slate-800">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />₡
                      {Number(c.budget || 0).toLocaleString('es-CR')}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-CR') : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={(e) => handleDelete(c.id, e)}
                    disabled={deleteId === c.id}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Eliminar registro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-[#002B49] group-hover:underline flex items-center gap-1">
                    Ver resultado <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
