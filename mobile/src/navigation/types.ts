/**
 * Strongly-typed route maps for React Navigation. Keep these declarations in
 * sync with the Stack/Tab.Navigator children — TypeScript catches typos at the
 * call site (`navigation.navigate('ScreenThatDoesNotExist')` becomes a compile
 * error rather than a silent no-op at runtime).
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

export interface ListingParam {
  listingId:    string;
  sellerId:     string;
  sellerName?:  string;
  kind:         string;
  teamName:     string;
  continent:    string;
  country:      string;
  season:       string;
  supplier:     string;
  model:        string;
  garmentType:  string;
  size:         string;
  condition:    string;
  gender:       string;
  priceCents:   number;
  description?: string;
  photoKeys:    string[];
  isMpc:        boolean;
  status:       string;
  createdAt:    string;
}

export type AuthStackParamList = {
  SignIn: undefined;
  EmailSignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  TotpLogin: undefined;
  VerifyPhone: undefined;
  VerifyCpf: undefined;
  LgpdConsent: undefined;
  OnboardingSurvey: undefined;
};

export type MainTabParamList = {
  Feed: undefined;
  Search: undefined;
  NewListing: undefined;
  Home: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  VerifyPhone: undefined;
  VerifyCpf: undefined;
  ListingDetail: { listing: ListingParam };
  SellerProfile: { sellerId: string; sellerName: string };
  RateOrder: { orderId: string; rateeId: string; rateeName: string; raterRole: 'BUYER' | 'SELLER' };
  AdminReports: { secret: string };
  AdminUsers: { secret: string };
  DadosPessoais: undefined;
  Financeiro: undefined;
  Checkout: { listing: ListingParam };
  PixPayment: {
    orderId: string;
    pixQrCode: string;
    pixQrCodeUrl: string;
    pixExpiresAt: string;
    totalCents: number;
    teamName: string;
  };
  Orders: undefined;
  OrderDetail: { orderId: string };
  Quiz: undefined;
  Cart: undefined;
  OnboardingSurvey: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
