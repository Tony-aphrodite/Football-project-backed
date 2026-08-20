import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Eye, EyeOff } from 'lucide-react-native';

import type { AuthStackParamList } from '../../navigation/types';
import { AuthApi } from '../../api/auth';
import { useAuthStore } from '../../store/auth.store';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailSignIn'>;

export function EmailSignInScreen({ navigation }: Props) {
  const setSession       = useAuthStore((s) => s.setSession);
  const setTotpTempToken = useAuthStore((s) => s.setTotpTempToken);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [busy,     setBusy]     = useState(false);

  const onLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      Alert.alert('Atenção', 'Preencha e-mail e senha.');
      return;
    }
    setBusy(true);
    try {
      const result = await AuthApi.emailLogin(e, password);
      if ('totpRequired' in result) {
        setTotpTempToken(result.tempToken);
      } else {
        await setSession(result);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      Alert.alert('Erro', typeof msg === 'string' ? msg : 'E-mail ou senha incorretos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={['#335336', '#2A4429', '#211B15']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Voltar */}
            <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: 32 }}>
              <Text style={{ color: '#D4AF37', fontSize: 15 }}>← Voltar</Text>
            </Pressable>

            {/* Título */}
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 26, marginBottom: 6 }}>
              Entrar
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 32 }}>
              Use seu e-mail e senha para acessar a Arena dos Mantos.
            </Text>

            {/* Campo e-mail */}
            <Text style={label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              style={input}
            />

            {/* Campo senha */}
            <Text style={[label, { marginTop: 16 }]}>Senha</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor="rgba(255,255,255,0.3)"
                secureTextEntry={!showPwd}
                autoComplete="password"
                autoCapitalize="none"
                autoCorrect={false}
                style={[input, { paddingRight: 52 }]}
              />
              <Pressable
                onPress={() => setShowPwd((v) => !v)}
                style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                hitSlop={8}
              >
                {showPwd ? <EyeOff size={18} color="rgba(255,255,255,0.6)" /> : <Eye size={18} color="rgba(255,255,255,0.6)" />}
              </Pressable>
            </View>

            {/* Botão entrar */}
            <Pressable
              onPress={onLogin}
              disabled={busy}
              style={{
                backgroundColor: '#D4AF37',
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: 'center',
                marginTop: 28,
              }}
            >
              {busy
                ? <ActivityIndicator color="#211B15" />
                : <Text style={{ color: '#211B15', fontWeight: '800', fontSize: 15 }}>Entrar</Text>
              }
            </Pressable>

            {/* Link esqueci senha */}
            <Pressable
              onPress={() => navigation.navigate('ForgotPassword')}
              style={{ marginTop: 12, alignItems: 'center' }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
                Esqueci minha senha
              </Text>
            </Pressable>

            {/* Link para criar conta */}
            <Pressable
              onPress={() => navigation.navigate('SignUp')}
              style={{ marginTop: 20, alignItems: 'center' }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
                Não tem conta?{' '}
                <Text style={{ color: '#D4AF37', fontWeight: '700' }}>Criar conta</Text>
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const label: object = { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', marginBottom: 6 };
const input: object = {
  backgroundColor: 'rgba(255,255,255,0.10)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.18)',
  borderRadius: 12,
  color: '#FFF',
  fontSize: 15,
  paddingHorizontal: 14,
  paddingVertical: 13,
};
