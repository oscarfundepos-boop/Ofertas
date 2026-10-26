import React, { useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  Activity,
  FileSpreadsheet,
  RotateCcw,
  Search,
  UserPlus,
  X,
  Loader2,
  Lock,
  KeyRound,
} from 'lucide-react';
import { Usuario, useAuth } from '../context/AuthContext';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'comparisons' | 'audit'>('users');
  const [users, setUsers] = useState<Usuario[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form for creating a new user
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState<'asesor' | 'administrador'>('asesor');
  const [nuevaClave, setNuevaClave] = useState('Fundepos2026*');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Load data based on tab
  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      if (activeTab === 'users') {
        const res = await fetch('/api/usuarios');
        const data = await res.json();
        if (data.success && data.usuarios) {
          setUsers(data.usuarios);
        }
      } else if (activeTab === 'comparisons') {
        const res = await fetch('/api/comparaciones');
        const data = await res.json();
        if (data.success && data.comparaciones) {
          setComparisons(data.comparaciones);
        }
      } else if (activeTab === 'audit') {
        const res = await fetch('/api/auditoria');
        const data = await res.json();
        if (data.success && data.logs) {
          setAuditLogs(data.logs);
        }
      }
    } catch (err: any) {
      console.error('Error loading admin data:', err);
      setStatusMsg({ type: 'error', text: 'Error al consultar datos del servidor: ' + (err.message || 'Error de conexión') });
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
  const handleToggleRole = async (targetUser: Usuario) => {
    if (targetUser.usuario === 'admin') {
      setStatusMsg({ type: 'error', text: 'No se puede remover el rol del administrador principal.' });
      return;
    }
    const newRole = targetUser.rol === 'administrador' ? 'asesor' : 'administrador';
    try {
      const res = await fetch(`/api/usuarios/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo actualizar el rol.');
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, rol: newRole } : u))
      );
      setStatusMsg({
        type: 'success',
        text: `Rol de @${targetUser.usuario} actualizado a ${newRole === 'administrador' ? 'Administrador' : 'Asesor'}.`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  // Toggle user status (active / suspended)
  const handleToggleStatus = async (targetUser: Usuario) => {
    if (targetUser.id === currentUser?.id) {
      setStatusMsg({ type: 'error', text: 'No puedes suspender tu propia cuenta activa.' });
      return;
    }
    if (targetUser.usuario === 'admin') {
      setStatusMsg({ type: 'error', text: 'No se puede suspender al administrador principal.' });
      return;
    }
    const newStatus = targetUser.estado === 'activo' ? 'suspendido' : 'activo';
    try {
      const res = await fetch(`/api/usuarios/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo cambiar el estado.');
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, estado: newStatus } : u))
      );
      setStatusMsg({
        type: 'success',
        text: `Usuario @${targetUser.usuario} ahora está ${newStatus === 'activo' ? 'Activo' : 'Suspendido'}.`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  // Reset temporary password
  const handleResetPassword = async (targetUser: Usuario) => {
    if (!confirm(`¿Restablecer la contraseña temporal de @${targetUser.usuario} a "Fundepos2026*" y forzar cambio de clave?`)) return;
    try {
      const res = await fetch(`/api/usuarios/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetearClave: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo resetear la contraseña.');
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, debeCambiarClave: true } : u))
      );
      setStatusMsg({
        type: 'success',
        text: `Contraseña de @${targetUser.usuario} reseteada a "Fundepos2026*". Se le exigirá cambiarla al entrar.`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  // Create new user submit
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoUsuario.trim() || !nuevoNombre.trim()) {
      setStatusMsg({ type: 'error', text: 'Por favor completa todos los campos del usuario.' });
      return;
    }

    setIsCreatingUser(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: nuevoUsuario.trim().toLowerCase(),
          nombre: nuevoNombre.trim(),
          rol: nuevoRol,
          clave: nuevaClave,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo crear el usuario.');
      }

      setUsers((prev) => [...prev, data.usuario]);
      setShowCreateModal(false);
      setNuevoUsuario('');
      setNuevoNombre('');
      setNuevaClave('Fundepos2026*');
      setStatusMsg({
        type: 'success',
        text: `Usuario @${data.usuario.usuario} creado con éxito con clave temporal "${nuevaClave}".`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsCreatingUser(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter(
    (u) =>
      u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.usuario.toLowerCase().includes(searchQuery.toLowerCase())
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
              <h2 className="text-lg font-bold">Consola de Administración y Usuarios</h2>
              <p className="text-xs text-slate-300">
                Gestión de cuentas (data/usuarios.json), roles y auditoría del servidor
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

        {/* Tab Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex items-center justify-between flex-wrap gap-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-[#002B49] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Registro de Auditoría</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'users' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Nuevo usuario</span>
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5 py-1 px-2.5 rounded hover:bg-slate-200 transition cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refrescar</span>
            </button>
          </div>
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
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#002B49] mb-3" />
              <p className="text-sm">Cargando datos del servidor...</p>
            </div>
          ) : activeTab === 'users' ? (
            <div>
              {/* Search & Counter */}
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por usuario o nombre completo..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49]"
                  />
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {filteredUsers.length} usuario(s) registrados
                </div>
              </div>

              {/* Users Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                    <tr>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Nombre Completo</th>
                      <th className="p-3">Rol</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Último Acceso</th>
                      <th className="p-3 text-right">Acciones de Administrador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-[10px] font-bold">
                            {u.usuario.charAt(0).toUpperCase()}
                          </div>
                          <span>@{u.usuario}</span>
                          {u.debeCambiarClave && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-medium">
                              Clave temporal
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{u.nombre}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              u.rol === 'administrador'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}
                          >
                            {u.rol === 'administrador' ? 'ADMINISTRADOR' : 'ASESOR'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              u.estado === 'activo'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {u.estado === 'activo' ? 'ACTIVO' : 'SUSPENDIDO'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 text-[11px]">
                          {u.ultimoAcceso && u.ultimoAcceso !== 'Nunca'
                            ? new Date(u.ultimoAcceso).toLocaleString('es-CR')
                            : 'Nunca'}
                        </td>
                        <td className="p-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleToggleRole(u)}
                            disabled={u.usuario === 'admin'}
                            className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-30 cursor-pointer"
                            title="Cambiar rol entre Asesor y Administrador"
                          >
                            {u.rol === 'administrador' ? 'Hacer Asesor' : 'Hacer Admin'}
                          </button>

                          <button
                            onClick={() => handleResetPassword(u)}
                            className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer"
                            title="Restablecer contraseña a Fundepos2026*"
                          >
                            Reset Clave
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={u.id === currentUser?.id || u.usuario === 'admin'}
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition disabled:opacity-30 cursor-pointer ${
                              u.estado === 'activo'
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {u.estado === 'activo' ? 'Suspender' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
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
                      <th className="p-3">Cotizaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {comparisons.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-slate-500 whitespace-nowrap">
                          {c.fechaCreacion ? new Date(c.fechaCreacion).toLocaleDateString('es-CR') : 'N/A'}
                        </td>
                        <td className="p-3 font-bold text-slate-800">@{c.usuario}</td>
                        <td className="p-3 text-slate-900 font-semibold">{c.nombreCliente}</td>
                        <td className="p-3 text-slate-600">{c.vehiculo}</td>
                        <td className="p-3 font-semibold text-slate-900">
                          ₡ {Number(c.presupuesto || 0).toLocaleString('es-CR')}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                            {c.cantidadPropuestas} cotizaciones
                          </span>
                        </td>
                      </tr>
                    ))}
                    {comparisons.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          Aún no se han guardado comparaciones en el servidor (data/comparaciones.json).
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
                            {log.accion}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-semibold">@{log.usuario}</td>
                        <td className="p-3 text-slate-600">{log.detalles}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          Sin eventos de auditoría registrados (data/auditoria.json).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Create User Modal Subdialog */}
        {showCreateModal && (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">Crear nuevo usuario</h3>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre de usuario (corto, sin espacios, minúsculas)
                  </label>
                  <input
                    type="text"
                    required
                    value={nuevoUsuario}
                    onChange={(e) => setNuevoUsuario(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="ej. carlosmora"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    required
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="ej. Carlos Mora Valverde"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rol asignado
                  </label>
                  <select
                    value={nuevoRol}
                    onChange={(e) => setNuevoRol(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] bg-white"
                  >
                    <option value="asesor">Asesor de Seguros</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contraseña temporal inicial
                  </label>
                  <input
                    type="text"
                    required
                    value={nuevaClave}
                    onChange={(e) => setNuevaClave(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002B49] font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    * El usuario estará obligado a cambiarla en su primer inicio de sesión.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="px-4 py-2 text-xs font-bold bg-[#002B49] hover:bg-[#0B3A63] text-white rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isCreatingUser ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creando...</span>
                      </>
                    ) : (
                      <span>Crear usuario</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Usuarios almacenados de forma segura con contraseñas cifradas con bcrypt</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#002B49] text-white font-semibold hover:bg-[#0B3A63] transition cursor-pointer"
          >
            Cerrar Consola
          </button>
        </div>
      </div>
    </div>
  );
};
