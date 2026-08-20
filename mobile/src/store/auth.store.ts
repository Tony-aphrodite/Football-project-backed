import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { useCartStore } from './cart.store';

export interface PublicUser {
  userId: string;
  displayName: string;
  email?: string;
  phoneE164?: string;
  cpf?: string;
  sellerCep?:     string;
  sellerRua?:     string;
  sellerNumero?:  string;
  sellerCidade?:  string;
  sellerEstado?:  string;
  lgpdConsentAt?: string;
  surveyCompletedAt?: string;
  nomeCompleto?: string;
  dadosPessoaisLockedAt?: string;
  bankCode?: string;
  bankAgency?: string;
  bankAgencyDigit?: string;
  bankAccount?: string;
  bankAccountDigit?: string;
  bankLockedAt?: string;
  pagarmeRecipientId?: string;
  ratingAvgAsSeller?: number;
  ratingCountAsSeller: number;
  ratingAvgAsBuyer?: number;
  ratingCountAsBuyer: number;
  listingsActiveCount: number;
  mpcPurchasesCount: number;
  totpEnabled: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: string;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

interface AuthState {
  hydrated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: PublicUser | null;
  totpTempToken: string | null;      // in-memory only, not persisted
  isGuest: boolean;                  // in-memory only, not persisted
  hydrate: () => Promise<void>;
  setSession: (s: Session) => Promise<void>;
  setTotpTempToken: (token: string) => void;
  setTotpEnabled: (enabled: boolean) => void;
  setUser: (user: PublicUser) => void;
  setListingsActiveCount: (count: number) => void;
  enterAsGuest: () => void;
  clear: () => Promise<void>;
}

const ACCESS_KEY  = 'adm.accessToken';
const REFRESH_KEY = 'adm.refreshToken';
const USER_KEY    = 'adm.user';          // persist user so Activity recreate works

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  accessToken: null,
  refreshToken: null,
  user: null,
  totpTempToken: null,
  isGuest: false,

  async hydrate() {
    if (get().hydrated) return;
    const [accessToken, refreshToken, userJson] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    const user: PublicUser | null = userJson ? JSON.parse(userJson) : null;
    set({
      hydrated: true,
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
      user,
    });
    // Restore cart from backend after session is hydrated
    if (accessToken && user) {
      void useCartStore.getState().loadCart();
    }
  },

  async setSession(s) {
    // Update in-memory state FIRST so RootNavigator re-renders immediately.
    // SecureStore writes happen in the background for persistence only.
    set({
      accessToken:  s.accessToken,
      refreshToken: s.refreshToken,
      user:         s.user,
    });
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY,  s.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, s.refreshToken),
      SecureStore.setItemAsync(USER_KEY,    JSON.stringify(s.user)),
    ]);
  },

  setTotpTempToken(token: string) {
    set({ totpTempToken: token });
  },

  enterAsGuest() {
    set({ isGuest: true });
  },

  setTotpEnabled(enabled: boolean) {
    const user = get().user;
    if (!user) return;
    const updated = { ...user, totpEnabled: enabled };
    set({ user: updated });
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
  },

  setUser(user: PublicUser) {
    set({ user });
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  setListingsActiveCount(count: number) {
    const user = get().user;
    if (!user) return;
    const updated = { ...user, listingsActiveCount: count };
    set({ user: updated });
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
  },

  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    set({ accessToken: null, refreshToken: null, user: null, totpTempToken: null, isGuest: false });
  },
}));
