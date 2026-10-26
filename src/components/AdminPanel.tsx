import React, { useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Activity,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  RotateCcw,
  Search,
  UserCheck,
  UserX,
  X,
  Calendar,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, useAuth } from '../context/AuthContext';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'comparisons' | 'audit'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load data based on tab
  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      if (activeTab === 'users') {
        const usersSnap = await getDocs(collection(db, 'users'));
        const uList: UserProfile[] = [];
        usersSnap.forEach((doc) => {
          uList.push(doc.data() as UserProfile);
        });
        setUsers(uList);
      } else if (activeTab === 'comparisons') {
        const compSnap = await getDocs(collection(db, 'comparisons'));
        const cList: any[] = [];
        compSnap.forEach((doc) => {
          cList.push({ id: doc.id, ...doc.data() });
        });
        // Sort descending by date
        cList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setComparisons(cList);
      } else if (activeTab === 'audit') {
        const auditSnap = await getDocs(collection(db, 'audit_logs'));
        const aList: any[] = [];
        auditSnap.forEach((doc) => {
          aList.push({ id: doc.id, ...doc.data() });
        });
        aList.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        setAuditLogs(aList);
      }
    } catch (err: any) {
      console.error('Error loading admin data:', err);
      setStatusMsg({ type: 'error', text: 'Error al consultar Firestore: ' + (err.message || 'Permiso denegado') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  // Toggle user role
  const handleToggleRole = async (targetUser: UserProfile) => {
    if (targetUser.email === 'oscar.fundepos@gmail.com') {
      setStatusMsg({ type: 'error', text: 'No se puede remover el rol de administrador principal.' });
      return;
    }
    const newRole = targetUser.role === 'admin' ? 'asesor' : 'admin';
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await updateDoc(userRef, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.uid === targetUser.uid ? { ...u, role: newRole } : u))
      );
      setStatusMsg({
        type: 'success',
        text: `Rol de ${targetUser.displayName} actualizado a ${newRole === 'admin' ? 'Administrador' : 'Asesor'}.`,
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  // Toggle user status (active / suspended)
  const handleToggleStatus = async (targetUser: UserProfile) => {
    if (targetUser.uid === currentUser?.uid) {
      setStatusMsg({ type: 'error', text: 'No puedes suspender tu propia cuenta activa.' });
      return;
    }
    const newStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await updateDoc(userRef, { status: newStatus });
      setUsers((prev) =>
        prev.map((u) => (u.uid === targetUser.uid ? { ...u, status: newStatus } : u))
      );
      setStatusMsg({
        type: 'success',
        text: `Usuario ${targetUser.displayName} ahora está ${newStatus === 'active' ? 'Activo' : 'Suspendido'}.`,
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#002B49] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Consola de Administración y Seguridad</h2>
              <p className="text-xs text-slate-300">
                Control de usuarios, roles RBAC y auditoría de cotizaciones de producción
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex items-center justify-between flex-wrap gap-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-[#002B49] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuarios y Asesores ({users.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('comparisons')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'comparisons'
                  ? 'bg-[#002B49] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Historial Global ({comparisons.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'audit'
                  ? 'bg-[#002B49] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Registro de Auditoría</span>
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5 py-1 px-2.5 rounded hover:bg-slate-200 transition"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refrescar</span>
          </button>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            className={`mx-6 mt-4 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#002B49] mb-3" />
              <p className="text-sm">Cargando datos de seguridad...</p>
            </div>
          ) : activeTab === 'users' ? (
            <div>
              {/* Search */}
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar asesor por nombre o email..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49]"
                  />
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Mostrando {filteredUsers.length} usuario(s)
                </div>
              </div>

              {/* Users Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                    <tr>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Correo</th>
                      <th className="p-3">Rol</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-right">Acciones RBAC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-semibold text-slate-900 flex items-center gap-2.5">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-6 h-6 rounded-full" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-[10px] font-bold">
                              {u.displayName.charAt(0)}
                            </div>
                          )}
                          <span>{u.displayName}</span>
                        </td>
                        <td className="p-3 text-slate-600">{u.email}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              u.role === 'admin'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}
                          >
                            {u.role === 'admin' ? 'ADMINISTRADOR' : 'ASESOR'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              u.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {u.status === 'active' ? 'ACTIVO' : 'SUSPENDIDO'}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => handleToggleRole(u)}
                            disabled={u.email === 'oscar.fundepos@gmail.com'}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-40"
                            title="Cambiar rol entre Asesor y Administrador"
                          >
                            {u.role === 'admin' ? 'Bajar a Asesor' : 'Hacer Admin'}
                          </button>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={u.uid === currentUser?.uid}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition disabled:opacity-40 ${
                              u.status === 'active'
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {u.status === 'active' ? 'Suspender' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          No se encontraron usuarios registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'comparisons' ? (
            <div>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                    <tr>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Asesor</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Vehículo</th>
                      <th className="p-3">Presupuesto</th>
                      <th className="p-3">Propuestas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {comparisons.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-slate-500 whitespace-nowrap">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-CR') : 'N/A'}
                        </td>
                        <td className="p-3 font-semibold text-slate-800">{c.userEmail}</td>
                        <td className="p-3 text-slate-900 font-bold">{c.clientName}</td>
                        <td className="p-3 text-slate-600">{c.vehicle}</td>
                        <td className="p-3 font-semibold text-slate-900">
                          ₡ {Number(c.budget || 0).toLocaleString('es-CR')}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                            {c.proposalsCount} cotizaciones
                          </span>
                        </td>
                      </tr>
                    ))}
                    {comparisons.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          Aún no se han guardado comparaciones en el sistema.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                    <tr>
                      <th className="p-3">Fecha y Hora</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Detalles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-slate-500 whitespace-nowrap text-[11px]">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString('es-CR') : 'N/A'}
                        </td>
                        <td className="p-3">
                          <span className="font-mono text-[11px] font-bold text-slate-900 px-2 py-0.5 rounded bg-slate-100">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{log.userEmail || log.userId}</td>
                        <td className="p-3 text-slate-600">{log.details}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          Sin eventos de auditoría registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Sistema Seguro con Reglas de Acceso Basadas en Roles (RBAC) y Firestore</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#002B49] text-white font-semibold hover:bg-[#0B3A63] transition"
          >
            Cerrar Consola
          </button>
        </div>
      </div>
    </div>
  );
};
