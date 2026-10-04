'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import type { UserRole, CustomClaims, Customer } from '@/types';

interface AuthUser {
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  role: UserRole | null;
  storeId?: string;
  regionId?: string;
  claims: CustomClaims | null;
}

interface AuthContextType {
  user: AuthUser | null;
  customer: Customer | null;
  setCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
  refreshCustomer: () => Promise<void>;
  loading: boolean;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  customer: null,
  setCustomer: () => {},
  refreshCustomer: async () => {},
  loading: true,
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomerProfile = useCallback(async (uid: string) => {
    try {
      // 1. Try finding by uid field
      const q = query(collection(db, 'customers'), where('uid', '==', uid), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setCustomer({ id: snap.docs[0].id, ...snap.docs[0].data() } as Customer);
        return;
      }

      // 2. Fallback: direct doc lookup by ID (in case customer ID is uid)
      const directDoc = await getDoc(doc(db, 'customers', uid));
      if (directDoc.exists()) {
        setCustomer({ id: directDoc.id, ...directDoc.data() } as Customer);
        return;
      }
    } catch (e) {
      console.warn('Customer profile load error:', e);
    }
  }, []);

  const refreshCustomer = useCallback(async () => {
    if (user?.uid) {
      await fetchCustomerProfile(user.uid);
    }
  }, [user?.uid, fetchCustomerProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setCustomer(null);
        setLoading(false);
        return;
      }

      // Get custom claims from the ID token
      const tokenResult = await firebaseUser.getIdTokenResult();
      const claims = tokenResult.claims as unknown as CustomClaims;
      const role = (claims?.role as UserRole) ?? 'customer';

      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        phone: firebaseUser.phoneNumber,
        displayName: firebaseUser.displayName,
        role,
        storeId: claims?.storeId,
        regionId: claims?.regionId,
        claims,
      };

      setUser(authUser);

      // Instantly resolve customer profile if role is customer
      if (role === 'customer') {
        await fetchCustomerProfile(firebaseUser.uid);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchCustomerProfile]);

  const signOutUser = async () => {
    await signOut(auth);
    setUser(null);
    setCustomer(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        customer,
        setCustomer,
        refreshCustomer,
        loading,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRequireRole(allowedRoles: UserRole[]) {
  const { user, loading } = useAuth();
  const isAuthorized = user ? allowedRoles.includes((user.role ?? 'customer') as UserRole) : false;
  return { user, loading, isAuthorized };
}

