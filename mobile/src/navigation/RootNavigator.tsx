import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/auth.store';
import { registerPushToken } from '../utils/pushNotifications';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { EmailSignInScreen } from '../screens/auth/EmailSignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { TotpLoginScreen } from '../screens/auth/TotpLoginScreen';
import { VerifyPhoneScreen } from '../screens/auth/VerifyPhoneScreen';
import { VerifyCpfScreen } from '../screens/auth/VerifyCpfScreen';
import { VerifyPhoneProfileScreen } from '../screens/auth/VerifyPhoneProfileScreen';
import { VerifyCpfProfileScreen } from '../screens/auth/VerifyCpfProfileScreen';
import { LgpdConsentScreen } from '../screens/auth/LgpdConsentScreen';
import { OnboardingSurveyScreen } from '../screens/auth/OnboardingSurveyScreen';
import { MainTabs } from './MainTabs';
import { ListingDetailScreen } from '../screens/listing/ListingDetailScreen';
import { SellerProfileScreen } from '../screens/seller/SellerProfileScreen';
import { RateOrderScreen } from '../screens/rating/RateOrderScreen';
import { AdminReportsScreen } from '../screens/admin/AdminReportsScreen';
import { AdminUsersScreen } from '../screens/admin/AdminUsersScreen';
import { DadosPessoaisScreen } from '../screens/profile/DadosPessoaisScreen';
import { FinanceiroScreen } from '../screens/profile/FinanceiroScreen';
import { CheckoutScreen } from '../screens/orders/CheckoutScreen';
import { OrdersScreen } from '../screens/orders/OrdersScreen';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen';
import { PixPaymentScreen } from '../screens/orders/PixPaymentScreen';
import { QuizScreen } from '../screens/quiz/QuizScreen';
import { CartScreen } from '../screens/cart/CartScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = (c: any) => c;
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();

/**
 * RootNavigator decides which screen to show based on the auth store state.
 * No manual navigation.navigate() calls needed — when setSession() updates
 * the store, this navigator automatically shows the correct next screen.
 *
 * Flow:
 *   no token       → SignIn
 *   token, no phone → VerifyPhone
 *   token, no cpf   → VerifyCpf
 *   token, no lgpd  → LgpdConsent
 *   all complete    → MainTabs
 */
export function RootNavigator() {
  const hydrated       = useAuthStore((s) => s.hydrated);
  const accessToken    = useAuthStore((s) => s.accessToken);
  const totpTempToken  = useAuthStore((s) => s.totpTempToken);
  const user           = useAuthStore((s) => s.user);
  const isGuest        = useAuthStore((s) => s.isGuest);
  const hydrate        = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Register push token once user is fully authenticated
  useEffect(() => {
    if (accessToken && user?.lgpdConsentAt && user?.surveyCompletedAt && !isGuest) {
      void registerPushToken();
    }
  }, [accessToken, user?.lgpdConsentAt, isGuest]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.arenaVerde }}>
        <ActivityIndicator size="large" color={colors.arenaDourado} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {totpTempToken ? (
          <Stack.Screen name="TotpLogin"   component={s(TotpLoginScreen)} />
        ) : !accessToken && !isGuest ? (
          <>
            <Stack.Screen name="SignIn"         component={s(SignInScreen)} />
            <Stack.Screen name="EmailSignIn"    component={s(EmailSignInScreen)} />
            <Stack.Screen name="SignUp"         component={s(SignUpScreen)} />
            <Stack.Screen name="ForgotPassword" component={s(ForgotPasswordScreen)} />
          </>
        ) : !isGuest && !user?.lgpdConsentAt ? (
          <Stack.Screen name="LgpdConsent" component={s(LgpdConsentScreen)} />
        ) : !isGuest && !user?.surveyCompletedAt ? (
          <Stack.Screen name="OnboardingSurvey" component={s(OnboardingSurveyScreen)} />
        ) : (
          <>
            <Stack.Screen name="Main"          component={s(MainTabs)} />
            <Stack.Screen name="ListingDetail" component={s(ListingDetailScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="SellerProfile" component={s(SellerProfileScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="RateOrder" component={s(RateOrderScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="AdminReports" component={s(AdminReportsScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="AdminUsers" component={s(AdminUsersScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="DadosPessoais" component={s(DadosPessoaisScreen)}
              options={{ animation: 'slide_from_right', headerShown: true, title: 'Dados Pessoais', headerStyle: { backgroundColor: '#335336' }, headerTitleStyle: { color: '#D4AF37', fontWeight: '800' }, headerTintColor: '#D4AF37' }}
            />
            <Stack.Screen name="Financeiro" component={s(FinanceiroScreen)}
              options={{ animation: 'slide_from_right', headerShown: true, title: 'Financeiro', headerStyle: { backgroundColor: '#335336' }, headerTitleStyle: { color: '#D4AF37', fontWeight: '800' }, headerTintColor: '#D4AF37' }}
            />
            <Stack.Screen name="Checkout" component={s(CheckoutScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="Orders" component={s(OrdersScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="OrderDetail" component={s(OrderDetailScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="PixPayment" component={s(PixPaymentScreen)}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="Quiz" component={s(QuizScreen)}
              options={{ animation: 'slide_from_right', headerShown: true, title: 'Quiz', headerStyle: { backgroundColor: colors.arenaVerde }, headerTitleStyle: { color: colors.arenaDouradoClaro, fontWeight: '800' }, headerTintColor: colors.arenaDouradoClaro }}
            />
            <Stack.Screen name="Cart" component={s(CartScreen)}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="VerifyPhone" component={s(VerifyPhoneProfileScreen)}
              options={{ animation: 'slide_from_bottom', headerShown: true, title: 'Verificar telefone', headerStyle: { backgroundColor: colors.arenaVerde }, headerTitleStyle: { color: colors.arenaDouradoClaro, fontWeight: '800' }, headerTintColor: colors.arenaDouradoClaro }}
            />
            <Stack.Screen name="VerifyCpf" component={s(VerifyCpfProfileScreen)}
              options={{ animation: 'slide_from_bottom', headerShown: true, title: 'Confirmar CPF', headerStyle: { backgroundColor: colors.arenaVerde }, headerTitleStyle: { color: colors.arenaDouradoClaro, fontWeight: '800' }, headerTintColor: colors.arenaDouradoClaro }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
