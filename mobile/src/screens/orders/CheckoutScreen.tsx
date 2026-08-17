import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Shirt, Package, Handshake, Ticket, Tag, X, CreditCard, QrCode } from 'lucide-react-native';

import type { RootStackParamList } from '../../navigation/types';
import { OrdersApi, type DeliveryMethod, type ShippingOption } from '../../api/orders';
import { PaymentsApi } from '../../api/payments';
import { CouponsApi, type RedeemResult } from '../../api/coupons';
import { webAlert } from '../../utils/webAlert';

type PaymentMethod = 'PIX' | 'CREDIT_CARD';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

const CONDITION_LABEL: Record<string, string> = {
  COM_ETIQUETA: 'Com etiqueta',
  PERFEITA:     'Perfeita',
  EXCELENTE:    'Excelente',
  BOA:          'Boa',
  REGULAR:      'Regular',
  DESGASTADA:   'Desgastada',
};

export function CheckoutScreen({ route, navigation }: Props) {
  const { listing } = route.params;

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('CORREIOS');
  const [buyerCep, setBuyerCep]             = useState('');
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [calculatingShipping, setCalculatingShipping] = useState(false);
  const [creatingOrder, setCreatingOrder]   = useState(false);

  const [paymentMethod, setPaymentMethod]   = useState<PaymentMethod>('PIX');

  // Credit card fields
  const [cardNumber,     setCardNumber]     = useState('');
  const [cardName,       setCardName]       = useState('');
  const [cardExpiry,     setCardExpiry]     = useState('');
  const [cardCvv,        setCardCvv]        = useState('');
  const [installments,   setInstallments]   = useState(1);

  const [couponInput,    setCouponInput]    = useState('');
  const [couponResult,   setCouponResult]   = useState<RedeemResult | null>(null);
  const [couponLoading,  setCouponLoading]  = useState(false);
  const [couponError,    setCouponError]    = useState('');

  const priceCents    = listing.priceCents;
  const shippingCents = deliveryMethod === 'ENTREGA_EM_MAOS' ? 0 : (selectedShipping?.priceCents ?? null);
  const discountCents = couponResult ? Math.round(priceCents * (couponResult.discountPct / 100)) : 0;
  const totalCents    = shippingCents !== null
    ? priceCents + shippingCents - discountCents
    : discountCents > 0 ? priceCents - discountCents : null;

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const cleanCep = buyerCep.replace(/\D/g, '');

  const handleCalculateShipping = async () => {
    if (cleanCep.length < 8) return;
    setCalculatingShipping(true);
    setShippingOptions([]);
    setSelectedShipping(null);
    try {
      const options = await OrdersApi.estimateShipping(listing.listingId, cleanCep);
      setShippingOptions(options);
    } catch {
      // silently ignore
    } finally {
      setCalculatingShipping(false);
    }
  };

  const handleCepChange = (text: string) => {
    const formatted = formatCep(text);
    setBuyerCep(formatted);
    setShippingOptions([]);
    setSelectedShipping(null);
  };

  const handleDeliveryChange = (method: DeliveryMethod) => {
    setDeliveryMethod(method);
    setShippingOptions([]);
    setSelectedShipping(null);
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    setCouponResult(null);
    try {
      const result = await CouponsApi.redeem(code);
      setCouponResult(result);
      setCouponInput('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCouponError(typeof msg === 'string' ? msg : 'Cupom inválido ou expirado.');
    } finally {
      setCouponLoading(false);
    }
  };

  const formatCardNumber = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16);
    return d.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const cardValid = paymentMethod === 'PIX' || (
    cardNumber.replace(/\D/g, '').length >= 13 &&
    cardName.trim().length >= 2 &&
    cardExpiry.length === 5 &&
    cardCvv.length >= 3
  );

  const canProceed = (deliveryMethod === 'ENTREGA_EM_MAOS' || selectedShipping !== null) && cardValid;

  const handlePay = async () => {
    if (!canProceed) {
      webAlert('Atenção', deliveryMethod === 'CORREIOS' && !selectedShipping
        ? 'Selecione uma opção de frete primeiro.'
        : 'Preencha os dados do cartão.');
      return;
    }
    setCreatingOrder(true);
    try {
      const order = await OrdersApi.create({
        listingId:         listing.listingId,
        deliveryMethod,
        buyerCep:          deliveryMethod === 'CORREIOS' ? buyerCep.replace(/\D/g, '') : undefined,
        shippingServiceId: deliveryMethod === 'CORREIOS' ? selectedShipping?.id : undefined,
        shippingCents:     deliveryMethod === 'CORREIOS' ? (selectedShipping?.priceCents ?? 0) : 0,
        couponCode:        couponResult?.code,
      });

      if (paymentMethod === 'PIX') {
        const pix = await PaymentsApi.initiatePixPayment(order.orderId);
        navigation.replace('PixPayment', {
          orderId:      order.orderId,
          pixQrCode:    pix.pixQrCode,
          pixQrCodeUrl: pix.pixQrCodeUrl,
          pixExpiresAt: pix.pixExpiresAt,
          totalCents:   pix.totalCents,
          teamName:     listing.teamName,
        });
      } else {
        const [expMonth, expYear] = cardExpiry.split('/').map(Number);
        const result = await PaymentsApi.initiateCardPayment({
          orderId:        order.orderId,
          installments,
          cardNumber:     cardNumber.replace(/\D/g, ''),
          cardHolderName: cardName.trim(),
          cardExpMonth:   expMonth,
          cardExpYear:    2000 + expYear,
          cardCvv:        cardCvv.trim(),
        });
        if (result.status === 'authorized') {
          webAlert('Pagamento aprovado! ✅', 'Seu pedido foi confirmado. Acompanhe em Meus Pedidos.');
          navigation.navigate('Orders');
        } else if (result.status === 'refused') {
          webAlert('Cartão recusado', 'Verifique os dados do cartão ou tente outro método de pagamento.');
        } else {
          webAlert('Pagamento pendente', 'Seu pagamento está sendo processado. Acompanhe em Meus Pedidos.');
          navigation.navigate('Orders');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tente novamente.';
      webAlert('Erro ao criar pedido', msg);
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#F4EFE3' }}>

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
        <Text style={{ color: '#F5E6B8', fontWeight: '800', fontSize: 17, flex: 1 }}>
          Finalizar Pedido
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>

        {/* Product card */}
        <View style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#E5DCC4',
          padding: 16,
          marginBottom: 16,
          flexDirection: 'row',
          gap: 14,
          alignItems: 'center',
        }}>
          <View style={{
            width: 64, height: 64, borderRadius: 12,
            backgroundColor: '#EFEFEF',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Shirt size={32} color="#335336" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 16, marginBottom: 2 }}>
              {listing.teamName}
            </Text>
            <Text style={{ color: '#9C9486', fontSize: 13, marginBottom: 6 }}>
              {listing.supplier} · {listing.season}
            </Text>
            <View style={{
              alignSelf: 'flex-start',
              backgroundColor: '#335336',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}>
              <Text style={{ color: '#F5E6B8', fontSize: 11, fontWeight: '700' }}>
                {listing.size} · {CONDITION_LABEL[listing.condition] ?? listing.condition}
              </Text>
            </View>
          </View>
        </View>

        {/* Delivery section */}
        <Text style={{
          color: '#9C9486', fontSize: 11, fontWeight: '700',
          letterSpacing: 1, marginBottom: 10,
        }}>
          ENTREGA
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {/* Correios */}
          <Pressable
            onPress={() => handleDeliveryChange('CORREIOS')}
            style={{
              flex: 1,
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: deliveryMethod === 'CORREIOS' ? 2 : 1,
              borderColor: deliveryMethod === 'CORREIOS' ? '#D4AF37' : '#E5DCC4',
              padding: 14,
              alignItems: 'center',
            }}
          >
            <Package size={22} color="#9C9486" style={{ marginBottom: 4 }} />
            <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 14 }}>Correios</Text>
            {deliveryMethod === 'CORREIOS' && (
              <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 2 }}>Calcular frete</Text>
            )}
          </Pressable>

          {/* Em Mãos */}
          <Pressable
            onPress={() => handleDeliveryChange('ENTREGA_EM_MAOS')}
            style={{
              flex: 1,
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: deliveryMethod === 'ENTREGA_EM_MAOS' ? 2 : 1,
              borderColor: deliveryMethod === 'ENTREGA_EM_MAOS' ? '#D4AF37' : '#E5DCC4',
              padding: 14,
              alignItems: 'center',
            }}
          >
            <Handshake size={22} color="#9C9486" style={{ marginBottom: 4 }} />
            <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 14 }}>Em Mãos</Text>
            {deliveryMethod === 'ENTREGA_EM_MAOS' && (
              <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 2 }}>Entrega pessoal • Sem frete</Text>
            )}
          </Pressable>
        </View>

        {/* CEP input — shown only for Correios */}
        {deliveryMethod === 'CORREIOS' && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#9C9486', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              SEU CEP
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={buyerCep}
                onChangeText={handleCepChange}
                placeholder="00000-000"
                placeholderTextColor="#C4BDB5"
                keyboardType="numeric"
                maxLength={9}
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#E5DCC4',
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 15,
                  color: '#1C1A14',
                }}
              />
              <Pressable
                onPress={handleCalculateShipping}
                disabled={cleanCep.length < 8 || calculatingShipping}
                style={({ pressed }) => ({
                  backgroundColor: cleanCep.length < 8 ? '#E5DCC4' : pressed ? '#B8942E' : '#D4AF37',
                  borderRadius: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  justifyContent: 'center',
                  alignItems: 'center',
                  flexShrink: 0,
                  width: 110,
                })}
              >
                {calculatingShipping
                  ? <ActivityIndicator size="small" color="#9C9486" />
                  : <Text style={{ color: cleanCep.length < 8 ? '#9C9486' : '#211B15', fontWeight: '800', fontSize: 15 }} numberOfLines={1}>Calcular</Text>
                }
              </Pressable>
            </View>

            {/* Shipping options */}
            {shippingOptions.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {shippingOptions.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => setSelectedShipping(opt)}
                    style={{
                      flex: 1,
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      borderWidth: selectedShipping?.id === opt.id ? 2 : 1,
                      borderColor: selectedShipping?.id === opt.id ? '#D4AF37' : '#E5DCC4',
                      padding: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#9C9486', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                      {opt.company.toUpperCase()}
                    </Text>
                    <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 14, marginTop: 2 }}>
                      {opt.service}
                    </Text>
                    <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 2 }}>
                      {opt.days} {opt.days === 1 ? 'dia útil' : 'dias úteis'}
                    </Text>
                    <Text style={{ color: '#335336', fontWeight: '700', fontSize: 13, marginTop: 4 }}>
                      {fmt(opt.priceCents)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Order summary card */}
        <View style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#E5DCC4',
          padding: 16,
          marginBottom: 12,
        }}>
          <Text style={{
            color: '#9C9486', fontSize: 11, fontWeight: '700',
            letterSpacing: 1, marginBottom: 12,
          }}>
            RESUMO
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: '#1C1A14', fontSize: 14 }}>Subtotal</Text>
            <Text style={{ color: '#1C1A14', fontSize: 14 }}>{fmt(priceCents)}</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: '#1C1A14', fontSize: 14 }}>Frete</Text>
            <Text style={{ color: '#1C1A14', fontSize: 14 }}>
              {deliveryMethod === 'ENTREGA_EM_MAOS'
                ? 'Grátis'
                : shippingCents !== null
                  ? fmt(shippingCents)
                  : '—'}
            </Text>
          </View>

          {couponResult && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ticket size={14} color="#22c55e" />
                <Text style={{ color: '#22c55e', fontSize: 14 }}>Cupom ({couponResult.discountPct}%)</Text>
                <Pressable onPress={() => { setCouponResult(null); }} hitSlop={8}>
                  <X size={12} color="#9C9486" />
                </Pressable>
              </View>
              <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700' }}>
                -{fmt(discountCents)}
              </Text>
            </View>
          )}

          <View style={{ height: 1, backgroundColor: '#EFEFEF', marginBottom: 12 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 16 }}>Total</Text>
            <Text style={{ color: '#D4AF37', fontWeight: '700', fontSize: 18 }}>
              {totalCents !== null ? fmt(totalCents) : fmt(priceCents)}
            </Text>
          </View>
        </View>

        {/* Coupon input */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16,
          borderWidth: 1, borderColor: '#E5DCC4', padding: 16, marginBottom: 12,
        }}>
          <Text style={{ color: '#9C9486', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>
            CUPOM DE DESCONTO
          </Text>
          {couponResult ? (
            <View style={{
              backgroundColor: '#dcfce7', borderRadius: 10, padding: 12,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Ticket size={20} color="#166534" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#166534', fontWeight: '800', fontSize: 14 }}>
                  {couponResult.code} — {couponResult.discountPct}% off
                </Text>
                {couponResult.description ? (
                  <Text style={{ color: '#166534', fontSize: 12 }}>{couponResult.description}</Text>
                ) : null}
              </View>
              <Pressable onPress={() => setCouponResult(null)}>
                <X size={18} color="#166534" />
              </Pressable>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={couponInput}
                  onChangeText={(t) => { setCouponInput(t.toUpperCase()); setCouponError(''); }}
                  placeholder="CÓDIGO DO CUPOM"
                  placeholderTextColor="#C4BDB5"
                  autoCapitalize="characters"
                  style={{
                    flex: 1, borderWidth: 1,
                    borderColor: couponError ? '#ef4444' : '#E5DCC4',
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                    fontSize: 14, color: '#1C1A14', backgroundColor: '#F4EFE3',
                  }}
                />
                <Pressable
                  onPress={handleApplyCoupon}
                  disabled={couponLoading || !couponInput.trim()}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? '#B8962B' : '#D4AF37',
                    borderRadius: 10,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    justifyContent: 'center',
                    alignItems: 'center',
                    minWidth: 90,
                    flexShrink: 0,
                  })}
                >
                  {couponLoading
                    ? <ActivityIndicator size="small" color="#211B15" />
                    : <Text style={{ color: '#211B15', fontWeight: '800', fontSize: 15 }}>
                        Aplicar
                      </Text>
                  }
                </Pressable>
              </View>
              {couponError ? (
                <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{couponError}</Text>
              ) : null}
            </>
          )}
        </View>

        {/* Payment method selector */}
        <Text style={{ color: '#9C9486', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>
          FORMA DE PAGAMENTO
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <Pressable
            onPress={() => setPaymentMethod('PIX')}
            style={{
              flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center',
              borderWidth: paymentMethod === 'PIX' ? 2 : 1,
              borderColor: paymentMethod === 'PIX' ? '#D4AF37' : '#E5DCC4',
            }}
          >
            <QrCode size={22} color={paymentMethod === 'PIX' ? '#335336' : '#9C9486'} style={{ marginBottom: 4 }} />
            <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 14 }}>PIX</Text>
            <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 2 }}>Instantâneo</Text>
          </Pressable>
          <Pressable
            onPress={() => setPaymentMethod('CREDIT_CARD')}
            style={{
              flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center',
              borderWidth: paymentMethod === 'CREDIT_CARD' ? 2 : 1,
              borderColor: paymentMethod === 'CREDIT_CARD' ? '#D4AF37' : '#E5DCC4',
            }}
          >
            <CreditCard size={22} color={paymentMethod === 'CREDIT_CARD' ? '#335336' : '#9C9486'} style={{ marginBottom: 4 }} />
            <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 14 }}>Cartão</Text>
            <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 2 }}>Crédito</Text>
          </Pressable>
        </View>

        {/* Credit card form */}
        {paymentMethod === 'CREDIT_CARD' && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5DCC4', padding: 16, marginBottom: 12 }}>
            <Text style={{ color: '#9C9486', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>
              DADOS DO CARTÃO
            </Text>

            <TextInput
              value={cardNumber}
              onChangeText={(t) => setCardNumber(formatCardNumber(t))}
              placeholder="0000 0000 0000 0000"
              placeholderTextColor="#C4BDB5"
              keyboardType="numeric"
              maxLength={19}
              style={{ borderWidth: 1, borderColor: '#E5DCC4', borderRadius: 10, padding: 14, fontSize: 16, color: '#1C1A14', backgroundColor: '#F4EFE3', marginBottom: 10, letterSpacing: 2 }}
            />

            <TextInput
              value={cardName}
              onChangeText={setCardName}
              placeholder="Nome como no cartão"
              placeholderTextColor="#C4BDB5"
              autoCapitalize="characters"
              style={{ borderWidth: 1, borderColor: '#E5DCC4', borderRadius: 10, padding: 14, fontSize: 14, color: '#1C1A14', backgroundColor: '#F4EFE3', marginBottom: 10 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TextInput
                value={cardExpiry}
                onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                placeholder="MM/AA"
                placeholderTextColor="#C4BDB5"
                keyboardType="numeric"
                maxLength={5}
                style={{ flex: 1, borderWidth: 1, borderColor: '#E5DCC4', borderRadius: 10, padding: 14, fontSize: 14, color: '#1C1A14', backgroundColor: '#F4EFE3' }}
              />
              <TextInput
                value={cardCvv}
                onChangeText={(t) => setCardCvv(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="CVV"
                placeholderTextColor="#C4BDB5"
                keyboardType="numeric"
                maxLength={4}
                style={{ flex: 1, borderWidth: 1, borderColor: '#E5DCC4', borderRadius: 10, padding: 14, fontSize: 14, color: '#1C1A14', backgroundColor: '#F4EFE3' }}
              />
            </View>

            <Text style={{ color: '#9C9486', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Parcelas</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[1, 2, 3, 6, 12].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setInstallments(n)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: installments === n ? '#D4AF37' : '#EFEFEF',
                    borderWidth: 1, borderColor: installments === n ? '#D4AF37' : '#E5DCC4',
                  }}
                >
                  <Text style={{ color: installments === n ? '#211B15' : '#1C1A14', fontWeight: '700', fontSize: 13 }}>
                    {n}x
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Pagar.me security badge */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5DCC4', padding: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Tag size={22} color="#335336" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1C1A14', fontWeight: '700', fontSize: 14 }}>Pagamento via Pagar.me</Text>
              <Text style={{ color: '#9C9486', fontSize: 12, marginTop: 2 }}>
                {paymentMethod === 'PIX' ? 'PIX instantâneo' : 'Cartão de crédito'} · Ambiente seguro
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Bottom pay bar */}
      <View style={{
        backgroundColor: '#F4EFE3',
        borderTopWidth: 1,
        borderColor: '#E5DCC4',
        padding: 16,
      }}>
        <Pressable
          onPress={handlePay}
          disabled={creatingOrder}
          style={({ pressed }) => ({
            backgroundColor: creatingOrder ? '#B8942E' : pressed ? '#B8942E' : '#D4AF37',
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: 'center',
          })}
        >
          {creatingOrder ? (
            <ActivityIndicator color="#211B15" />
          ) : (
            <Text style={{ color: '#211B15', fontWeight: '800', fontSize: 16 }}>
              {canProceed
                ? (paymentMethod === 'PIX'
                    ? `Pagar ${totalCents !== null ? fmt(totalCents) : fmt(priceCents)} com PIX`
                    : `Pagar ${totalCents !== null ? fmt(totalCents) : fmt(priceCents)} com Cartão`)
                : (deliveryMethod === 'CORREIOS' && !selectedShipping
                    ? 'Selecione o frete primeiro'
                    : 'Preencha os dados do cartão')}
            </Text>
          )}
        </Pressable>
        <Text style={{ color: '#9C9486', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          Processamento seguro via Pagar.me
        </Text>
      </View>

    </SafeAreaView>
  );
}
