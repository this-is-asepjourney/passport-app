'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { collection, query, where, limit, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { resolveMediaUrl } from '@/lib/media';
import type { UserRole, CustomClaims, Customer } from '@/types';

export interface AuthUser {
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  photoUrl: string | null;
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
  updateUserPhoto: (url: string) => Promise<void>;
  loading: boolean;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  customer: null,
  setCustomer: () => {},
  refreshCustomer: async () => {},
  updateUserPhoto: async () => {},
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
        const cData = snap.docs[0].data() as Customer;
        if (cData.photoUrl) cData.photoUrl = resolveMediaUrl(cData.photoUrl);
        setCustomer({ ...cData, id: snap.docs[0].id });
        return;
      }

      // 2. Fallback: direct doc lookup by ID (in case customer ID is uid)
      const directDoc = await getDoc(doc(db, 'customers', uid));
      if (directDoc.exists()) {
        const cData = directDoc.data() as Customer;
        if (cData.photoUrl) cData.photoUrl = resolveMediaUrl(cData.photoUrl);
        setCustomer({ ...cData, id: directDoc.id });
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

      // Resolve photoUrl: try Firebase Auth photoURL first, then users doc if exists
      let photoUrl = firebaseUser.photoURL || null;
      try {
        const uSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (uSnap.exists() && uSnap.data()?.photoUrl) {
          photoUrl = uSnap.data()!.photoUrl;
        }
      } catch {
        // ignore
      }

      const resolvedPhoto = photoUrl ? resolveMediaUrl(photoUrl) : null;

      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        phone: firebaseUser.phoneNumber,
        displayName: firebaseUser.displayName,
        photoUrl: resolvedPhoto,
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

  const updateUserPhoto = useCallback(async (newUrl: string) => {
    if (!auth.currentUser) return;
    try {
      const normalizedUrl = resolveMediaUrl(newUrl);

      // 1. Firebase Auth update
      await updateProfile(auth.currentUser, { photoURL: normalizedUrl }).catch(() => {});

      // 2. Firestore users collection
      await setDoc(doc(db, 'users', auth.currentUser.uid), { photoUrl: normalizedUrl }, { merge: true }).catch(() => {});

      // 3. If customer, update customers collection & customer state
      if (user?.role === 'customer' || customer?.id) {
        const custId = customer?.id || auth.currentUser.uid;
        await updateDoc(doc(db, 'customers', custId), { photoUrl: normalizedUrl }).catch(() => {});
        setCustomer(prev => prev ? { ...prev, photoUrl: normalizedUrl } : null);
      }

      // 4. If BA, update baProfiles collection
      if (user?.role === 'ba') {
        await setDoc(doc(db, 'baProfiles', auth.currentUser.uid), { photoUrl: normalizedUrl }, { merge: true }).catch(() => {});
      }

      // 5. Update local user state immediately
      setUser(prev => prev ? { ...prev, photoUrl: normalizedUrl } : null);
    } catch (err) {
      console.error('Failed to update photo across user profile:', err);
    }
  }, [user?.role, customer?.id]);

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
        updateUserPhoto,
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

