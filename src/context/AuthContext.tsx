import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'asesor';
  status: 'active' | 'suspended';
  createdAt: string;
  lastLoginAt: string;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  isAdmin: false,
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync profile from Firestore
  const fetchProfile = async (user: User) => {
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userDocRef);
      const isBootstrappedAdmin = user.email?.toLowerCase() === 'oscar.fundepos@gmail.com';

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        // If it is the bootstrapped admin, ensure admin role
        if (isBootstrappedAdmin && data.role !== 'admin') {
          await updateDoc(userDocRef, { role: 'admin' });
          data.role = 'admin';
        }
        setUserProfile(data);
      } else {
        // Create initial profile
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'Asesor BN',
          photoURL: user.photoURL || '',
          role: isBootstrappedAdmin ? 'admin' : 'asesor',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, newProfile);
        setUserProfile(newProfile);

        // Record bootstrapped admin doc if applicable
        if (isBootstrappedAdmin) {
          try {
            await setDoc(doc(db, 'admins', user.uid), {
              email: user.email,
              role: 'admin',
              createdAt: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('Could not set admin marker:', e);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchProfile(user);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        await fetchProfile(res.user);
        // Log audit event
        try {
          const logRef = collection(db, 'audit_logs');
          await addDoc(logRef, {
            id: 'log_' + Date.now(),
            action: 'USER_LOGIN',
            userId: res.user.uid,
            userEmail: res.user.email || '',
            details: 'Inicio de sesión con Google exitoso',
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          // Non-blocking for login
          console.warn('Audit log write error:', e);
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (currentUser) {
      try {
        const logRef = collection(db, 'audit_logs');
        await addDoc(logRef, {
          id: 'log_' + Date.now(),
          action: 'USER_LOGOUT',
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          details: 'Cierre de sesión de usuario',
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Audit log write error on logout:', e);
      }
    }
    await signOut(auth);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await fetchProfile(currentUser);
    }
  };

  const isAdmin =
    userProfile?.role === 'admin' ||
    currentUser?.email?.toLowerCase() === 'oscar.fundepos@gmail.com';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isAdmin,
        loading,
        loginWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
