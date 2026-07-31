import { useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, User } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/auth.store';
import { UsersApi } from '../../api/users';

function Field({ label, value, onChangeText, locked, placeholder, keyboardType, autoCapitalize }: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  locked?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1.5,
        borderColor: locked ? 'rgba(255,255,255,0.1)' : '#335336',
        borderRadius: 12,
        backgroundColor: locked ? 'rgba(255,255,255,0.04)' : 'rgba(51,83,54,0.15)',
        paddingHorizontal: 14, paddingVertical: 12,
      }}>
        {locked && <View style={{ marginRight: 8 }}><Lock size={14} color="rgba(234,234,234,0.3)" /></View>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={!locked}
          placeholder={placeholder}
          placeholderTextColor="rgba(234,234,234,0.3)"
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'words'}
          style={{ flex: 1, color: locked ? 'rgba(234,234,234,0.5)' : '#EAEAEA', fontSize: 15 }}
        />
      </View>
    </View>
  );
}

export function DadosPessoaisScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const isLocked = !!user?.dadosPessoaisLockedAt;

  const maskCpf = (cpf?: string) =>
    cpf ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}` : '';

  const fmtPhone = (p?: string) =>
    p ? p.replace(/(\+55)(\d{2})(\d{5})(\d{4})/, '+55 ($2) $3-$4') : '';

  const [nome,  setNome]  = useState(user?.nomeCompleto ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim() || !email.trim()) {
      Alert.alert('Atenção', 'Preencha nome e e-mail.');
      return;
    }
    setSaving(true);
    try {
      const updated = await UsersApi.updateDadosPessoais(nome.trim(), email.trim());
      useAuthStore.getState().setSession({
        accessToken: useAuthStore.getState().accessToken!,
        refreshToken: useAuthStore.getState().refreshToken!,
        user: updated,
      });
      Alert.alert('Salvo!', 'Seus dados pessoais foram registrados.');
    } catch (err) {
      let detail = '';
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const msg = err.response?.data?.message ?? err.message;
        detail = `\n[${status ?? 'rede'}] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
      }
      Alert.alert('Erro', `Não foi possível salvar. Tente novamente.${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: '#3c3c3c' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

        {/* Header info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <User size={20} color="#D4AF37" />
          <Text style={{ color: '#EAEAEA', fontWeight: '700', fontSize: 16 }}>Dados Pessoais</Text>
          {isLocked && <Lock size={14} color="#D4AF37" />}
        </View>

        <Field
          label="NOME COMPLETO"
          value={nome}
          onChangeText={setNome}
          locked={isLocked}
          placeholder="Seu nome completo"
        />

        <Field
          label="E-MAIL"
          value={email}
          onChangeText={setEmail}
          locked={isLocked}
          placeholder="seu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Field
          label="TELEFONE"
          value={fmtPhone(user?.phoneE164)}
          locked
          placeholder="Não informado"
        />
        {!user?.phoneE164 && (
          <Pressable
            onPress={() => navigation.navigate('VerifyPhone')}
            style={{ marginTop: -8, marginBottom: 16, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: '#D4AF37', fontSize: 13, fontWeight: '600' }}>
              + Adicionar telefone
            </Text>
          </Pressable>
        )}

        <Field
          label="CPF"
          value={maskCpf(user?.cpf)}
          locked
          placeholder="Não informado"
        />

        {/* Warning */}
        <View style={{
          backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1,
          borderColor: 'rgba(212,175,55,0.3)', borderRadius: 12,
          padding: 14, marginTop: 8, marginBottom: 24,
        }}>
          <Text style={{ color: '#D4AF37', fontSize: 12, lineHeight: 18 }}>
            {isLocked
              ? 'Seus dados estão registrados. Para alterá-los, entre em contato via contato@arenadosmantos.app.br'
              : 'Após registrar os dados, só será possível alterá-los entrando em contato via contato@arenadosmantos.app.br'}
          </Text>
        </View>

        {!isLocked && (
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => ({
              backgroundColor: saving ? '#9C9486' : pressed ? '#243B26' : '#335336',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            })}
          >
            {saving
              ? <ActivityIndicator color="#D4AF37" />
              : <Text style={{ color: '#D4AF37', fontWeight: '900', fontSize: 16 }}>Salvar</Text>
            }
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
