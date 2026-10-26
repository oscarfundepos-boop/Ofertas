import React, { createContext, useContext, useEffect, useState } from 'react';

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: 'administrador' | 'asesor';
  estado: 'activo' | 'suspendido';
  debeCambiarClave: boolean;
  fechaCreacion: string;
  ultimoAcceso: string;
}

interface AuthContextType {
  user: Usuario | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: (usuario: string, clave: string) => Promise<void>;
  logout: () => Promise<void>;
  cambiarClave: (claveNueva: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  error: null,
  login: async () => {},
  logout: async () => {},
  cambiarClave: async () => {},
  refreshUser: async () => {},
  clearError: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/yo');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Error fetching session:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const login = async (usuario: string, clave: string) => {
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, clave }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.error || 'usuario o contraseña incorrectos';
        setError(msg);
        throw new Error(msg);
      }

      setUser(data.user);
    } catch (err: any) {
      if (!error) setError(err.message || 'Error al conectar con el servidor.');
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
      console.error('Error logging out:', err);
    } finally {
      setUser(null);
      setError(null);
    }
  };

  const cambiarClave = async (claveNueva: string) => {
    setError(null);
    try {
      const res = await fetch('/api/cambiar-clave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claveNueva }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.error || 'No se pudo cambiar la contraseña.';
        setError(msg);
        throw new Error(msg);
      }

      setUser(data.user);
    } catch (err: any) {
      throw err;
    }
  };

  const refreshUser = async () => {
    await fetchSession();
  };

  const clearError = () => setError(null);

  const isAdmin = user?.rol === 'administrador';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        error,
        login,
        logout,
        cambiarClave,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
