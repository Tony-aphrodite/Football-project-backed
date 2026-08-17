import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, Lock, AlertTriangle } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { useAuthStore } from '../../store/auth.store';
import { UsersApi, type FinanceiroBalance, type WithdrawalItem } from '../../api/users';

const BANKS = [
  { code: '001', name: 'Banco do Brasil' },
  { code: '033', name: 'Santander' },
  { code: '077', name: 'Inter' },
  { code: '104', name: 'Caixa Econômica' },
  { code: '208', name: 'BTG Pactual' },
  { code: '237', name: 'Bradesco' },
  { code: '260', name: 'Nu Pagamentos (Nubank)' },
  { code: '341', name: 'Itaú Unibanco' },
  { code: '422', name: 'Safra' },
  { code: '745', name: 'Citibank' },
];

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Lock size={13} color="rgba(234,234,234,0.25)" />
        <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 14 }}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12, marginTop: 8 }}>
      {title}
    </Text>
  );
}

export function FinanceiroScreen() {
  const user = useAuthStore((s) => s.user);

  const maskCpf = (cpf?: string) => cpf ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}` : '—';

  // Balance
  const [balance, setBalance]   = useState<FinanceiroBalance | null>(null);
  const [loadingBal, setLoadingBal] = useState(true);

  // Bank form
  const isBankLocked = !!user?.bankLockedAt;
  const [bankCode,         setBankCode]         = useState(user?.bankCode ?? '');
  const [bankAgency,       setBankAgency]       = useState(user?.bankAgency ?? '');
  const [bankAgencyDigit,  setBankAgencyDigit]  = useState(user?.bankAgencyDigit ?? '');
  const [bankAccount,      setBankAccount]      = useState(user?.bankAccount ?? '');
  const [bankAccountDigit, setBankAccountDigit] = useState(user?.bankAccountDigit ?? '');
  const [savingBank, setSavingBank] = useState(false);

  // Sacar
  const [sacarValue, setSacarValue] = useState('');
  const [sacarLoading, setSacarLoading] = useState(false);

  // Extrato
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [loadingExtrato, setLoadingExtrato] = useState(false);

  // Bank picker modal
  const [showBankPicker, setShowBankPicker] = useState(false);

  useEffect(() => {
    // Refresh user from backend so bankLockedAt / nomeCompleto are always current
    UsersApi.getMe().then((fresh) => {
      useAuthStore.getState().setSession({
        accessToken: useAuthStore.getState().accessToken!,
        refreshToken: useAuthStore.getState().refreshToken!,
        user: fresh,
      });
    }).catch(() => {});

    UsersApi.getFinanceiroBalance()
      .then(setBalance)
      .catch(() => setBalance({ available: 0, waitingFunds: 0, hasRecipient: false }))
      .finally(() => setLoadingBal(false));

    setLoadingExtrato(true);
    UsersApi.getWithdrawals()
      .then(setWithdrawals)
      .catch(() => setWithdrawals([]))
      .finally(() => setLoadingExtrato(false));
  }, []);

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const withdrawalStatusLabel = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'transferred':      return { label: 'Transferido',            color: '#4CAF50' };
      case 'waiting_transfer': return { label: 'Aguardando transf.',     color: '#D4AF37' };
      case 'pending':          return { label: 'Pendente',               color: '#D4AF37' };
      case 'failed':           return { label: 'Falhou',                 color: '#EF5350' };
      case 'canceled':         return { label: 'Cancelado',              color: '#9C9486' };
      default:                 return { label: status,                   color: '#9C9486' };
    }
  };

  const handleSaveBank = async () => {
    if (!bankCode || !bankAgency || !bankAccount || !bankAccountDigit) {
      Alert.alert('Atenção', 'Preencha todos os campos bancários.');
      return;
    }
    if (!user?.nomeCompleto || !user?.cpf) {
      Alert.alert('Atenção', 'Preencha os Dados Pessoais primeiro.');
      return;
    }
    Alert.alert(
      'Confirmar dados bancários',
      'Após salvar, não será possível alterar os dados bancários pelo app. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setSavingBank(true);
            try {
              const updated = await UsersApi.updateBankData({ bankCode, bankAgency, bankAgencyDigit, bankAccount, bankAccountDigit });
              useAuthStore.getState().setSession({
                accessToken: useAuthStore.getState().accessToken!,
                refreshToken: useAuthStore.getState().refreshToken!,
                user: updated,
              });
              Alert.alert('Salvo!', 'Conta bancária registrada com sucesso.');
              // Fetch balance separately — don't let it throw into the outer catch
              UsersApi.getFinanceiroBalance()
                .then(setBalance)
                .catch(() => {});
            } catch (err) {
              let detail = '';
              if (err instanceof AxiosError) {
                const status = err.response?.status;
                const msg = err.response?.data?.message ?? err.message;
                detail = `\n[${status ?? 'rede'}] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
              }
              Alert.alert('Erro', `Não foi possível salvar os dados bancários.${detail}`);
            } finally {
              setSavingBank(false);
            }
          },
        },
      ],
    );
  };

  const handleSacar = async () => {
    const val = parseFloat(sacarValue.replace(',', '.'));
    if (isNaN(val) || val <= 0) { Alert.alert('Atenção', 'Digite um valor válido.'); return; }
    const cents = Math.round(val * 100);
    if (balance && cents > balance.available) { Alert.alert('Saldo insuficiente', `Disponível: ${fmt(balance.available)}`); return; }

    Alert.alert('Confirmar saque', `Sacar ${fmt(cents)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          setSacarLoading(true);
          try {
            await UsersApi.sacar(cents);
            Alert.alert('Saque solicitado!', 'O valor será transferido para sua conta em até 1 dia útil.');
            setSacarValue('');
            const [newBal, newHistory] = await Promise.all([
              UsersApi.getFinanceiroBalance(),
              UsersApi.getWithdrawals(),
            ]);
            setBalance(newBal);
            setWithdrawals(newHistory);
          } catch (err) {
            const detail = err instanceof AxiosError
              ? `\n[${err.response?.status ?? 'rede'}] ${err.response?.data?.message ?? err.message}`
              : '';
            Alert.alert('Erro', `Não foi possível processar o saque.${detail}`);
          } finally {
            setSacarLoading(false);
          }
        },
      },
    ]);
  };

  const selectedBank = BANKS.find((b) => b.code === bankCode);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: '#3c3c3c' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

        {/* ── Dados pessoais (locked) ── */}
        <SectionTitle title="DADOS PESSOAIS" />
        <View style={{ backgroundColor: '#444', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <LockedField label="NOME COMPLETO" value={user?.nomeCompleto ?? ''} />
          <LockedField label="E-MAIL" value={user?.email ?? ''} />
          <LockedField label="CPF" value={maskCpf(user?.cpf)} />
        </View>

        {/* ── Saldo ── */}
        <SectionTitle title="SALDO" />
        <View style={{ backgroundColor: '#444', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          {loadingBal ? (
            <ActivityIndicator color="#D4AF37" />
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 11, marginBottom: 4 }}>DISPONÍVEL</Text>
                  <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 22 }}>
                    {fmt(balance?.available ?? 0)}
                  </Text>
                </View>
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 11, marginBottom: 4 }}>A RECEBER</Text>
                  <Text style={{ color: '#EAEAEA', fontWeight: '700', fontSize: 18 }}>
                    {fmt(balance?.waitingFunds ?? 0)}
                  </Text>
                </View>
              </View>

              {/* Sacar */}
              {isBankLocked && (
                <View style={{ borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingTop: 14 }}>
                  <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 12, marginBottom: 8 }}>Valor para sacar (R$)</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      value={sacarValue}
                      onChangeText={setSacarValue}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor="rgba(234,234,234,0.3)"
                      style={{ flex: 1, borderWidth: 1.5, borderColor: '#335336', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#EAEAEA', fontSize: 15 }}
                    />
                    <Pressable
                      onPress={handleSacar}
                      disabled={sacarLoading}
                      style={({ pressed }) => ({
                        backgroundColor: sacarLoading ? '#9C9486' : pressed ? '#243B26' : '#335336',
                        borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center',
                      })}
                    >
                      {sacarLoading
                        ? <ActivityIndicator color="#D4AF37" size="small" />
                        : <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 14 }}>Sacar</Text>
                      }
                    </Pressable>
                  </View>
                  <Text style={{ color: 'rgba(234,234,234,0.4)', fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                    A cada saque será descontado o valor de R$3,67 referente à intermediadora de pagamentos.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Extrato ── */}
        <SectionTitle title="EXTRATO DE SAQUES" />
        <View style={{ backgroundColor: '#444', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          {loadingExtrato ? (
            <ActivityIndicator color="#D4AF37" />
          ) : withdrawals.length === 0 ? (
            <Text style={{ color: 'rgba(234,234,234,0.4)', fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>
              Nenhum saque realizado ainda.
            </Text>
          ) : (
            withdrawals.map((w, idx) => {
              const { label, color } = withdrawalStatusLabel(w.status);
              return (
                <View
                  key={w.id}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingVertical: 12,
                    borderBottomWidth: idx < withdrawals.length - 1 ? 1 : 0,
                    borderColor: 'rgba(255,255,255,0.07)',
                  }}
                >
                  <View>
                    <Text style={{ color: '#EAEAEA', fontWeight: '700', fontSize: 15 }}>{fmt(w.amount)}</Text>
                    <Text style={{ color: 'rgba(234,234,234,0.45)', fontSize: 12, marginTop: 2 }}>{fmtDate(w.createdAt)}</Text>
                  </View>
                  <View style={{ backgroundColor: `${color}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Dados bancários ── */}
        <SectionTitle title="CONTA BANCÁRIA" />
        <View style={{ backgroundColor: '#444', borderRadius: 16, padding: 16, marginBottom: 16 }}>

          {/* Warning CPF */}
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <View style={{ marginTop: 1 }}><AlertTriangle size={14} color="#F59E0B" /></View>
            <Text style={{ color: '#F59E0B', fontSize: 12, flex: 1, lineHeight: 17 }}>
              O CPF da conta bancária deve ser o mesmo registrado no perfil.
            </Text>
          </View>

          {/* Bank selector */}
          <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>BANCO</Text>
          {isBankLocked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
              <Lock size={13} color="rgba(234,234,234,0.25)" />
              <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 14 }}>{selectedBank ? `${selectedBank.code} — ${selectedBank.name}` : bankCode}</Text>
            </View>
          ) : showBankPicker ? (
            <View style={{ borderWidth: 1, borderColor: '#335336', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
              {BANKS.map((b) => (
                <Pressable
                  key={b.code}
                  onPress={() => { setBankCode(b.code); setShowBankPicker(false); }}
                  style={({ pressed }) => ({
                    padding: 14, backgroundColor: pressed ? 'rgba(51,83,54,0.3)' : b.code === bankCode ? 'rgba(51,83,54,0.2)' : 'transparent',
                    borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                  })}
                >
                  <Text style={{ color: '#EAEAEA', fontSize: 14 }}>{b.code} — {b.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable
              onPress={() => setShowBankPicker(true)}
              style={({ pressed }) => ({
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                borderWidth: 1.5, borderColor: '#335336', borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
                backgroundColor: pressed ? 'rgba(51,83,54,0.2)' : 'rgba(51,83,54,0.1)',
              })}
            >
              <Text style={{ color: bankCode ? '#EAEAEA' : 'rgba(234,234,234,0.3)', fontSize: 15 }}>
                {selectedBank ? `${selectedBank.code} — ${selectedBank.name}` : 'Selecionar banco'}
              </Text>
              <DollarSign size={16} color="#335336" />
            </Pressable>
          )}

          {/* Agência */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 3 }}>
              <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>AGÊNCIA</Text>
              <TextInput
                value={bankAgency}
                onChangeText={setBankAgency}
                editable={!isBankLocked}
                placeholder="0000"
                placeholderTextColor="rgba(234,234,234,0.3)"
                keyboardType="numeric"
                style={{ borderWidth: 1.5, borderColor: isBankLocked ? 'rgba(255,255,255,0.1)' : '#335336', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: isBankLocked ? 'rgba(234,234,234,0.5)' : '#EAEAEA', fontSize: 15, backgroundColor: isBankLocked ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>DÍGITO</Text>
              <TextInput
                value={bankAgencyDigit}
                onChangeText={setBankAgencyDigit}
                editable={!isBankLocked}
                placeholder="X"
                placeholderTextColor="rgba(234,234,234,0.3)"
                keyboardType="default"
                maxLength={1}
                style={{ borderWidth: 1.5, borderColor: isBankLocked ? 'rgba(255,255,255,0.1)' : '#335336', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: isBankLocked ? 'rgba(234,234,234,0.5)' : '#EAEAEA', fontSize: 15, backgroundColor: isBankLocked ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              />
            </View>
          </View>

          {/* Conta */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <View style={{ flex: 3 }}>
              <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>CONTA</Text>
              <TextInput
                value={bankAccount}
                onChangeText={setBankAccount}
                editable={!isBankLocked}
                placeholder="00000000"
                placeholderTextColor="rgba(234,234,234,0.3)"
                keyboardType="numeric"
                style={{ borderWidth: 1.5, borderColor: isBankLocked ? 'rgba(255,255,255,0.1)' : '#335336', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: isBankLocked ? 'rgba(234,234,234,0.5)' : '#EAEAEA', fontSize: 15, backgroundColor: isBankLocked ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(234,234,234,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>DÍGITO</Text>
              <TextInput
                value={bankAccountDigit}
                onChangeText={setBankAccountDigit}
                editable={!isBankLocked}
                placeholder="0"
                placeholderTextColor="rgba(234,234,234,0.3)"
                keyboardType="default"
                maxLength={2}
                style={{ borderWidth: 1.5, borderColor: isBankLocked ? 'rgba(255,255,255,0.1)' : '#335336', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: isBankLocked ? 'rgba(234,234,234,0.5)' : '#EAEAEA', fontSize: 15, backgroundColor: isBankLocked ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              />
            </View>
          </View>

          {/* Tipo: only Pessoa Física for now */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, marginBottom: 4 }}>
            <Text style={{ color: '#EAEAEA', fontSize: 14 }}>Pessoa Física</Text>
          </View>
        </View>

        {/* Lock warning */}
        <View style={{
          backgroundColor: 'rgba(212,175,55,0.08)', borderWidth: 1,
          borderColor: 'rgba(212,175,55,0.25)', borderRadius: 12,
          padding: 14, marginBottom: 24,
        }}>
          <Text style={{ color: '#D4AF37', fontSize: 12, lineHeight: 18 }}>
            {isBankLocked
              ? 'Dados bancários registrados. Para alterações, entre em contato via contato@arenadosmantos.app.br'
              : 'Após registrar os dados, só será possível alterá-los entrando em contato via contato@arenadosmantos.app.br'}
          </Text>
        </View>

        {!isBankLocked && (
          <Pressable
            onPress={handleSaveBank}
            disabled={savingBank}
            style={({ pressed }) => ({
              backgroundColor: savingBank ? '#9C9486' : pressed ? '#243B26' : '#335336',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 8,
            })}
          >
            {savingBank
              ? <ActivityIndicator color="#D4AF37" />
              : <Text style={{ color: '#D4AF37', fontWeight: '900', fontSize: 16 }}>Salvar dados bancários</Text>
            }
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
