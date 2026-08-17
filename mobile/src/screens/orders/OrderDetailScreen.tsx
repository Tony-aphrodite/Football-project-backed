import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Package, Truck, Tag, Shirt } from 'lucide-react-native';
import { webAlert, webConfirm } from '../../utils/webAlert';

import type { RootStackParamList } from '../../navigation/types';
import { OrdersApi, type OrderPublic, type OrderStatus } from '../../api/orders';
import { useAuthStore } from '../../store/auth.store';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

const STATUS_STEPS: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
];

const STEP_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID:            'Pago',
  SHIPPED:         'Enviado',
  DELIVERED:       'Entregue',
  COMPLETED:       'Concluído',
  DISPUTED:        'Em disputa',
  CANCELLED:       'Cancelado',
};

const CONDITION_LABEL: Record<string, string> = {
  COM_ETIQUETA: 'Com etiqueta',
  PERFEITA:     'Perfeita',
  EXCELENTE:    'Excelente',
  BOA:          'Boa',
  REGULAR:      'Regular',
  DESGASTADA:   'Desgastada',
};

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: '#2a2a2a',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      padding: 16,
      marginBottom: 12,
    }}>
      <Text style={{
        color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700',
        letterSpacing: 1, marginBottom: 12,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value, bold, gold }: {
  label: string; value: string; bold?: boolean; gold?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ color: '#EAEAEA', fontSize: 14, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={{ color: gold ? '#D4AF37' : '#EAEAEA', fontSize: bold ? 16 : 14, fontWeight: bold ? '700' : '400' }}>
        {value}
      </Text>
    </View>
  );
}

export function OrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const currentUser = useAuthStore((s) => s.user);

  const [order, setOrder]   = useState<OrderPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeInput, setShowDisputeInput] = useState(false);
  const [disputing, setDisputing] = useState(false);

  const fetchOrder = () => {
    setLoading(true);
    OrdersApi.findOne(orderId)
      .then(setOrder)
      .catch(() => { /* silently ignore */ })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleConfirmReceipt = () => {
    webConfirm(
      'Confirmar recebimento',
      'Você confirma que recebeu o produto em boas condições?',
      async () => {
        setConfirming(true);
        try {
          await OrdersApi.confirmReceipt(orderId);
          fetchOrder();
        } catch {
          webAlert('Erro', 'Não foi possível confirmar o recebimento.');
        } finally {
          setConfirming(false);
        }
      },
      undefined,
      'Confirmar',
    );
  };

  const handleDispute = () => {
    if (!disputeReason.trim()) return;
    webConfirm(
      'Abrir disputa',
      'Você confirma que deseja reportar um problema com este pedido? Nossa equipe entrará em contato.',
      async () => {
        setDisputing(true);
        try {
          await OrdersApi.disputeOrder(orderId, disputeReason.trim());
          setShowDisputeInput(false);
          setDisputeReason('');
          fetchOrder();
        } catch {
          webAlert('Erro', 'Não foi possível abrir a disputa. Tente novamente.');
        } finally {
          setDisputing(false);
        }
      },
      undefined,
      'Confirmar',
    );
  };

  const shortId = orderId.slice(-8).toUpperCase();

  const canConfirm =
    order !== null &&
    currentUser?.userId === order.buyerId &&
    (order.status === 'PAID' || order.status === 'SHIPPED');

  const canDispute =
    order !== null &&
    currentUser?.userId === order.buyerId &&
    ['PAID', 'SHIPPED', 'DELIVERED'].includes(order.status);

  const daysUntilRelease = (() => {
    if (!order?.escrowReleaseAt) return null;
    if (!['PAID', 'SHIPPED', 'DELIVERED'].includes(order.status)) return null;
    const ms = new Date(order.escrowReleaseAt).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  })();

  const handleSaveTracking = async () => {
    if (!trackingInput.trim() || !order) return;
    setSavingTracking(true);
    try {
      const updated = await OrdersApi.addTracking(orderId, trackingInput.trim());
      setOrder(updated);
      setTrackingInput('');
    } catch {
      webAlert('Erro', 'Não foi possível salvar o código de rastreio.');
    } finally {
      setSavingTracking(false);
    }
  };

  const isSeller = order !== null && currentUser?.userId === order.sellerId;
  const canAddTracking =
    isSeller &&
    order.deliveryMethod === 'CORREIOS' &&
    (order.status === 'PAID' || order.status === 'SHIPPED') &&
    !order.correiosTracking &&
    !order.shippingTrackingCode;

  const canRate =
    order !== null &&
    (order.status === 'DELIVERED' || order.status === 'COMPLETED') &&
    (currentUser?.userId === order.buyerId || currentUser?.userId === order.sellerId);

  const raterRole = order && currentUser?.userId === order.buyerId ? 'BUYER' : 'SELLER';
  const rateeId   = order && raterRole === 'BUYER' ? order.sellerId : order?.buyerId ?? '';
  const rateeName = order && raterRole === 'BUYER' ? order.sellerName : order?.buyerName ?? '';

  // Timeline helpers
  const currentStepIndex = order ? STATUS_STEPS.indexOf(order.status) : -1;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#3c3c3c' }}>

      {/* Header */}
      <View style={{
        backgroundColor: '#335336',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
      }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ color: '#D4AF37', fontSize: 22 }}>←</Text>
        </Pressable>
        <Text style={{ color: '#F5E6B8', fontWeight: '800', fontSize: 17 }}>
          Pedido #{shortId}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#335336" />
        </View>
      ) : !order ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 15 }}>Pedido não encontrado</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: canConfirm ? 100 : 24 }}>

            {/* Status timeline card */}
            <SectionCard title="STATUS">
              {order.status === 'CANCELLED' ? (
                <View style={{
                  backgroundColor: '#FEE2E2',
                  borderRadius: 12,
                  padding: 12,
                  alignItems: 'center',
                }}>
                  <Text style={{ color: '#991B1B', fontWeight: '700', fontSize: 15 }}>
                    Cancelado
                  </Text>
                </View>
              ) : (
                STATUS_STEPS.map((step, index) => {
                  const isCompleted = index < currentStepIndex;
                  const isCurrent   = index === currentStepIndex;
                  const isFuture    = index > currentStepIndex;
                  const isLast      = index === STATUS_STEPS.length - 1;

                  return (
                    <View key={step}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: isLast ? 0 : 0 }}>
                        {/* Circle + connector column */}
                        <View style={{ alignItems: 'center', width: 20 }}>
                          <View style={{
                            width: 20, height: 20, borderRadius: 10,
                            backgroundColor: isCompleted
                              ? '#D4AF37'
                              : isCurrent
                                ? '#335336'
                                : 'transparent',
                            borderWidth: isFuture ? 2 : 0,
                            borderColor: 'rgba(255,255,255,0.3)',
                          }} />
                          {!isLast && (
                            <View style={{
                              width: 2,
                              height: 20,
                              backgroundColor: isCompleted ? '#D4AF37' : 'rgba(255,255,255,0.15)',
                            }} />
                          )}
                        </View>

                        {/* Label */}
                        <Text style={{
                          color: isFuture ? 'rgba(234,234,234,0.35)' : '#EAEAEA',
                          fontSize: 14,
                          fontWeight: isCurrent ? '700' : '400',
                          paddingVertical: 10,
                        }}>
                          {STEP_LABEL[step]}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </SectionCard>

            {/* Product card */}
            <SectionCard title="PRODUTO">
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                <View style={{
                  width: 64, height: 64, borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Shirt size={32} color="#335336" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#EAEAEA', fontWeight: '700', fontSize: 16, marginBottom: 2 }}>
                    {order.teamName}
                  </Text>
                  <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 13 }}>
                    {order.supplier} · {order.season}
                  </Text>
                  <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 13 }}>
                    Tam. {order.size} · {CONDITION_LABEL[order.condition] ?? order.condition}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 14 }}>Valor do item</Text>
                <Text style={{ color: '#EAEAEA', fontSize: 14, fontWeight: '600' }}>{fmt(order.priceCents)}</Text>
              </View>
            </SectionCard>

            {/* Delivery card */}
            <SectionCard title="ENTREGA">
              {order.deliveryMethod === 'CORREIOS' ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Package size={18} color="rgba(234,234,234,0.4)" />
                    <Text style={{ color: '#EAEAEA', fontWeight: '600', fontSize: 14 }}>
                      {order.shippingCarrier ?? 'Correios'} {order.shippingService ? `— ${order.shippingService}` : ''}
                    </Text>
                  </View>
                  {order.buyerCep ? (
                    <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 13, marginBottom: 4 }}>
                      CEP do comprador: {order.buyerCep}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#EAEAEA', fontSize: 14, marginBottom: 8 }}>
                    Frete: {fmt(order.shippingCents)}
                  </Text>

                  {/* Tracking code — seller manual or Melhor Envio */}
                  {(order.correiosTracking || order.shippingTrackingCode) ? (
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Truck size={14} color="#335336" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#335336', letterSpacing: 1 }}>
                          CÓDIGO DE RASTREIO
                        </Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#EAEAEA', letterSpacing: 1 }}>
                        {order.correiosTracking ?? order.shippingTrackingCode}
                      </Text>
                    </View>
                  ) : null}

                  {/* Seller: input tracking code if not yet set */}
                  {canAddTracking && (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 12, marginBottom: 6 }}>
                        Informe o código de rastreio dos Correios:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          value={trackingInput}
                          onChangeText={(t) => setTrackingInput(t.toUpperCase())}
                          placeholder="AA123456789BR"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          autoCapitalize="characters"
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(255,255,255,0.08)',
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: '#EAEAEA',
                            fontSize: 14,
                            fontWeight: '700',
                            letterSpacing: 1,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.15)',
                          }}
                        />
                        <Pressable
                          onPress={handleSaveTracking}
                          disabled={!trackingInput.trim() || savingTracking}
                          style={({ pressed }) => ({
                            backgroundColor: trackingInput.trim() ? (pressed ? '#B8942E' : '#D4AF37') : 'rgba(255,255,255,0.15)',
                            borderRadius: 10,
                            paddingHorizontal: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                          })}
                        >
                          {savingTracking
                            ? <ActivityIndicator size="small" color="#211B15" />
                            : <Text style={{ color: '#211B15', fontWeight: '800', fontSize: 13 }}>Salvar</Text>
                          }
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Label download */}
                  {order.shippingLabelUrl ? (
                    <Pressable
                      onPress={() => void Linking.openURL(order.shippingLabelUrl!)}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: pressed ? '#2A4429' : '#335336',
                        borderRadius: 10, padding: 12,
                      })}
                    >
                      <Tag size={16} color="#D4AF37" />
                      <Text style={{ color: '#D4AF37', fontWeight: '700', fontSize: 14 }}>
                        Baixar etiqueta de envio
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Package size={18} color="rgba(234,234,234,0.4)" />
                    <Text style={{ color: '#EAEAEA', fontWeight: '600', fontSize: 14 }}>Entrega em Mãos</Text>
                  </View>
                  <Text style={{ color: '#9C9486', fontSize: 13, marginBottom: canConfirm ? 16 : 0 }}>
                    Entrega pessoal combinada entre comprador e vendedor
                  </Text>
                  {canConfirm && (
                    <Pressable
                      onPress={handleConfirmReceipt}
                      disabled={confirming}
                      style={({ pressed }) => ({
                        backgroundColor: confirming ? '#9C9486' : pressed ? '#243B26' : '#335336',
                        borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                        marginTop: 4,
                      })}
                    >
                      {confirming
                        ? <ActivityIndicator color="#D4AF37" />
                        : <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 15 }}>✓ Confirmar recebimento</Text>
                      }
                    </Pressable>
                  )}
                </>
              )}
            </SectionCard>

            {/* Summary card */}
            <SectionCard title="RESUMO">
              <SummaryRow label="Subtotal" value={fmt(order.priceCents)} />
              <SummaryRow
                label="Frete"
                value={order.deliveryMethod === 'ENTREGA_EM_MAOS' ? 'Grátis' : fmt(order.shippingCents)}
              />
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 10, marginTop: 2 }} />
              <SummaryRow label="Total" value={fmt(order.totalCents)} bold gold />
            </SectionCard>

            {/* Parties card */}
            <SectionCard title="PARTICIPANTES">
              <Pressable
                onPress={() => navigation.navigate('SellerProfile', { sellerId: order.sellerId, sellerName: order.sellerName })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: '#335336',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 14 }}>
                    {getInitials(order.sellerName)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 11 }}>Vendedor</Text>
                  <Text style={{ color: '#EAEAEA', fontWeight: '600', fontSize: 14 }}>
                    {order.sellerName}
                  </Text>
                </View>
                <Text style={{ color: 'rgba(234,234,234,0.4)', fontSize: 18 }}>›</Text>
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: '#335336',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 14 }}>
                    {getInitials(order.buyerName)}
                  </Text>
                </View>
                <View>
                  <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 11 }}>Comprador</Text>
                  <Text style={{ color: '#EAEAEA', fontWeight: '600', fontSize: 14 }}>
                    {order.buyerName}
                  </Text>
                </View>
              </View>
            </SectionCard>

          </ScrollView>

          {/* Auto-release countdown — visible to buyer while escrow is pending */}
          {daysUntilRelease !== null && order && currentUser?.userId === order.buyerId && (
            <View style={{
              backgroundColor: 'rgba(212,175,55,0.07)',
              borderTopWidth: 1, borderColor: 'rgba(212,175,55,0.2)',
              paddingHorizontal: 16, paddingVertical: 10,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            }}>
              <Text style={{ fontSize: 14 }}>⏱</Text>
              <Text style={{ color: 'rgba(212,175,55,0.8)', fontSize: 12, flex: 1, lineHeight: 17 }}>
                {daysUntilRelease === 0
                  ? 'Pagamento sendo processado automaticamente.'
                  : `Pagamento liberado automaticamente em ${daysUntilRelease} dia${daysUntilRelease !== 1 ? 's' : ''} se você não confirmar o recebimento.`}
              </Text>
            </View>
          )}

          {/* Confirm receipt button — only for Correios/non-hand-delivery (hand-delivery has it inside the card) */}
          {canConfirm && order.deliveryMethod !== 'ENTREGA_EM_MAOS' && (
            <View style={{ backgroundColor: '#2a2a2a', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 16, paddingBottom: 28 }}>
              <Pressable
                onPress={handleConfirmReceipt}
                disabled={confirming}
                style={({ pressed }) => ({
                  backgroundColor: confirming ? '#9C9486' : pressed ? '#B8942E' : '#D4AF37',
                  borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                })}
              >
                {confirming
                  ? <ActivityIndicator color="#211B15" />
                  : <Text style={{ color: '#211B15', fontWeight: '800', fontSize: 16 }}>Confirmar Recebimento</Text>
                }
              </Pressable>
            </View>
          )}

          {/* Dispute button — buyer can report a problem */}
          {canDispute && !showDisputeInput && (
            <View style={{ backgroundColor: '#2a2a2a', paddingHorizontal: 16, paddingBottom: canConfirm ? 4 : 28, paddingTop: canConfirm ? 0 : 12 }}>
              <Pressable
                onPress={() => setShowDisputeInput(true)}
                style={({ pressed }) => ({
                  borderWidth: 1, borderColor: 'rgba(255,80,80,0.4)',
                  borderRadius: 12, paddingVertical: 10, alignItems: 'center',
                  backgroundColor: pressed ? 'rgba(255,80,80,0.08)' : 'transparent',
                })}
              >
                <Text style={{ color: 'rgba(255,100,100,0.85)', fontSize: 13, fontWeight: '600' }}>
                  ⚠ Tive um problema com este pedido
                </Text>
              </Pressable>
            </View>
          )}

          {/* Dispute input — inline form */}
          {canDispute && showDisputeInput && (
            <View style={{ backgroundColor: '#2a2a2a', borderTopWidth: 1, borderColor: 'rgba(255,80,80,0.25)', padding: 16, paddingBottom: 28 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8 }}>
                Descreva o problema com o pedido:
              </Text>
              <TextInput
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder="Ex: recebi o produto errado, não chegou..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: '#1a1a1a', borderRadius: 10,
                  borderWidth: 1, borderColor: 'rgba(255,80,80,0.3)',
                  color: '#EAEAEA', fontSize: 13, padding: 12, marginBottom: 10,
                  minHeight: 70, textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => { setShowDisputeInput(false); setDisputeReason(''); }}
                  style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleDispute}
                  disabled={!disputeReason.trim() || disputing}
                  style={({ pressed }) => ({
                    flex: 2, borderRadius: 10, paddingVertical: 11, alignItems: 'center',
                    backgroundColor: disputeReason.trim() ? (pressed ? 'rgba(200,50,50,0.9)' : 'rgba(200,50,50,0.8)') : 'rgba(100,50,50,0.4)',
                  })}
                >
                  {disputing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Enviar disputa</Text>
                  }
                </Pressable>
              </View>
            </View>
          )}

          {/* Disputed status banner */}
          {order?.status === 'DISPUTED' && currentUser?.userId === order.buyerId && (
            <View style={{ backgroundColor: 'rgba(200,50,50,0.12)', borderTopWidth: 1, borderColor: 'rgba(200,50,50,0.3)', padding: 14, paddingBottom: 24 }}>
              <Text style={{ color: 'rgba(255,120,120,0.9)', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
                ⚠ Disputa em análise
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 17 }}>
                Nossa equipe está analisando seu caso e entrará em contato em breve.
              </Text>
            </View>
          )}

          {/* Rate button — after delivery */}
          {canRate && (
            <View style={{ backgroundColor: '#2a2a2a', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 16, paddingBottom: 28 }}>
              <Pressable
                onPress={() => navigation.navigate('RateOrder', {
                  orderId,
                  rateeId,
                  rateeName,
                  raterRole: raterRole as 'BUYER' | 'SELLER',
                })}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#2A4429' : '#335336',
                  borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                })}
              >
                <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 16 }}>
                  ⭐ Avaliar {raterRole === 'BUYER' ? 'Vendedor' : 'Comprador'}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}

    </SafeAreaView>
  );
}
