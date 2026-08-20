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

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const setSession = useAuthStore((s) => s.setSession);

  const [name,             setName]             = useState('');
  const [email,            setEmail]            = useState('');
  const [phone,            setPhone]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirm,          setConfirm]          = useState('');
  const [showPwd,          setShowPwd]          = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [busy,             setBusy]             = useState(false);

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2)  return d.length ? `(${d}` : '';
    if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  };

  const onRegister = async () => {
    const n = name.trim();
    const e = email.trim().toLowerCase();

    if (!n || !e || !password) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Atenção', 'A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Atenção', 'As senhas não coincidem.');
      return;
    }

    setBusy(true);
    try {
      const session = await AuthApi.register(n, e, password, phone.trim() || undefined, marketingConsent || undefined);
      await setSession(session);
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw[0] : raw;
      Alert.alert('Erro', typeof msg === 'string' ? msg : 'Não foi possível criar a conta. Tente novamente.');
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
              Criar conta
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 32 }}>
              Junte-se à maior comunidade de camisas de futebol do Brasil.
            </Text>

            {/* Nome */}
            <Text style={label}>Nome</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="words"
              autoComplete="name"
              style={input}
            />

            {/* E-mail */}
            <Text style={[label, { marginTop: 16 }]}>E-mail</Text>
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

            {/* Celular */}
            <Text style={[label, { marginTop: 16 }]}>Celular</Text>
            <TextInput
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              placeholder="(xx) xxxxx-xxxx"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
              autoComplete="off"
              maxLength={15}
              style={input}
            />

            {/* Senha */}
            <Text style={[label, { marginTop: 16 }]}>Senha</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor="rgba(255,255,255,0.3)"
                secureTextEntry={!showPwd}
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

            {/* Confirmar senha */}
            <Text style={[label, { marginTop: 16 }]}>Confirmar senha</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repita a senha"
              placeholderTextColor="rgba(255,255,255,0.3)"
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              autoCorrect={false}
              style={input}
            />

            {/* Indicador de força da senha */}
            {password.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                {[...Array(4)].map((_, i) => (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: password.length >= (i + 1) * 3
                        ? (password.length >= 12 ? '#4CAF50' : '#D4AF37')
                        : 'rgba(255,255,255,0.15)',
                    }}
                  />
                ))}
              </View>
            )}

            {/* Marketing consent checkbox */}
            <Pressable
              onPress={() => setMarketingConsent((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 }}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6, marginTop: 1,
                borderWidth: 2,
                borderColor: marketingConsent ? '#4CAF50' : 'rgba(255,255,255,0.35)',
                backgroundColor: marketingConsent ? '#4CAF50' : 'transparent',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {marketingConsent && (
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 }}>✓</Text>
                )}
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 20, flex: 1 }}>
                Aceito receber comunicações sobre o desenvolvimento do app
              </Text>
            </Pressable>

            {/* Botão criar conta */}
            <Pressable
              onPress={onRegister}
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
                : <Text style={{ color: '#211B15', fontWeight: '800', fontSize: 15 }}>Criar conta</Text>
              }
            </Pressable>

            {/* Link para login */}
            <Pressable
              onPress={() => navigation.navigate('EmailSignIn')}
              style={{ marginTop: 20, alignItems: 'center' }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
                Já tem conta?{' '}
                <Text style={{ color: '#D4AF37', fontWeight: '700' }}>Entrar</Text>
              </Text>
            </Pressable>

            <Text style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 24 }}>
              Ao criar conta você aceita nossa{' '}
              <Text style={{ color: '#D4AF37' }}>Política de Privacidade</Text>
              {' '}e os{' '}
              <Text style={{ color: '#D4AF37' }}>Termos de Uso</Text>.
            </Text>
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
  // Override Chrome autofill white background on web
  ...(Platform.OS === 'web' ? {
    WebkitBoxShadow: '0 0 0 30px #3a5c3c inset',
    WebkitTextFillColor: '#FFF',
  } : {}),
};
