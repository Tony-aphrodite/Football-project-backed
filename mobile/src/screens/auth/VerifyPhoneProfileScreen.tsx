import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AxiosError } from 'axios';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { AuthApi } from '../../api/auth';
import { useAuthStore } from '../../store/auth.store';
import { isValidE164, maskBrazilianPhone, toBrazilianE164 } from '../../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyPhone'>;

type Step = 'enter-phone' | 'enter-code';

export function VerifyPhoneProfileScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>('enter-phone');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);

  const e164 = useMemo(() => toBrazilianE164(phoneRaw), [phoneRaw]);
  const phoneValid = e164 !== null && isValidE164(e164);

  const onSendCode = async () => {
    if (!phoneValid) return;
    setBusy(true);
    try {
      await AuthApi.startPhoneVerification(e164!);
      setStep('enter-code');
    } catch (err) {
      let detail = '';
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const msg = err.response?.data?.message ?? err.message;
        detail = `\n[${status ?? 'rede'}] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
      }
      Alert.alert('Erro', `Não foi possível enviar o código.${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const session = await AuthApi.verifyPhone(e164!, code);
      await setSession(session);
      navigation.goBack();
    } catch (err) {
      let detail = '';
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const msg = err.response?.data?.message ?? err.message;
        detail = `\n[${status ?? 'rede'}] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
      }
      Alert.alert('Código inválido', `O código está incorreto ou expirou.${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-arena-verde">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-12">
          <Text className="text-white text-3xl font-black mb-2">
            {step === 'enter-phone' ? 'Verifique seu celular' : 'Digite o código'}
          </Text>
          <Text className="text-white/60 mb-8">
            {step === 'enter-phone'
              ? 'Enviaremos um código de 6 dígitos por SMS.'
              : `Enviado para ${maskBrazilianPhone(phoneRaw)}.`}
          </Text>

          {step === 'enter-phone' ? (
            <TextInput
              value={maskBrazilianPhone(phoneRaw)}
              onChangeText={(t) => setPhoneRaw(t)}
              placeholder="(11) 99999-9999"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="number-pad"
              maxLength={16}
              className="bg-white/10 border border-white/20 rounded-2xl px-4 py-4 text-white text-lg"
            />
          ) : (
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              className="bg-white/10 border border-white/20 rounded-2xl px-4 py-4 text-white text-2xl tracking-widest text-center"
            />
          )}
        </View>

        <View className="px-6 pb-12">
          {step === 'enter-phone' ? (
            <Pressable
              onPress={onSendCode}
              disabled={!phoneValid || busy}
              className={`rounded-2xl py-4 items-center ${phoneValid ? 'bg-arena-dourado' : 'bg-white/15'}`}
            >
              {busy ? (
                <ActivityIndicator color="#1C1A14" />
              ) : (
                <Text className="text-arena-fundo font-bold text-base">Enviar código</Text>
              )}
            </Pressable>
          ) : (
            <View className="gap-3">
              <Pressable
                onPress={onVerifyCode}
                disabled={code.length !== 6 || busy}
                className={`rounded-2xl py-4 items-center ${code.length === 6 ? 'bg-arena-dourado' : 'bg-white/15'}`}
              >
                {busy ? (
                  <ActivityIndicator color="#1C1A14" />
                ) : (
                  <Text className="text-arena-fundo font-bold text-base">Verificar</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setStep('enter-phone')} className="items-center py-2">
                <Text className="text-white/60 text-sm">Mudar número</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
