import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Package, Handshake, Shirt } from 'lucide-react-native';

import type { RootStackParamList } from '../../navigation/types';
import { OrdersApi, type OrderPublic, type OrderStatus } from '../../api/orders';
import { useAuthStore } from '../../store/auth.store';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

type TabKey = 'buying' | 'selling';

interface StatusBadgeConfig {
  bg: string;
  text: string;
  label: string;
}

const STATUS_BADGE: Record<OrderStatus, StatusBadgeConfig> = {
  PENDING_PAYMENT: { bg: '#FEF3C7', text: '#92400E', label: 'Aguardando pagamento' },
  PAID:            { bg: '#DBEAFE', text: '#1E40AF', label: 'Pago' },
  SHIPPED:         { bg: '#FED7AA', text: '#92400E', label: 'Enviado' },
  DELIVERED:       { bg: '#D1FAE5', text: '#065F46', label: 'Entregue' },
  COMPLETED:       { bg: '#FEF3C7', text: '#78350F', label: 'Concluído' },
  DISPUTED:        { bg: '#FEE2E2', text: '#991B1B', label: 'Em disputa' },
  CANCELLED:       { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelado' },
};

function StatusChip({ status }: { status: OrderStatus }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING_PAYMENT;
  return (
    <View style={{
      backgroundColor: cfg.bg,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: 'flex-start',
    }}>
      <Text style={{ color: cfg.text, fontSize: 11, fontWeight: '700' }}>{cfg.label}</Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: OrderPublic; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: '#2a2a2a',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 16,
        marginBottom: 10,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Top row */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
      }}>
        <View style={{
          width: 48, height: 48, borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.08)',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Shirt size={24} color="#335336" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#EAEAEA', fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
            {order.teamName}
          </Text>
          <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 12, marginTop: 1 }}>
            {order.supplier} · {order.season}
          </Text>
          <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 12 }}>Tam. {order.size}</Text>
        </View>
        <StatusChip status={order.status} />
      </View>

      {/* Bottom row */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {order.deliveryMethod === 'CORREIOS'
            ? <Package size={12} color="rgba(234,234,234,0.4)" />
            : <Handshake size={12} color="rgba(234,234,234,0.4)" />
          }
          <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 12 }}>
            {order.deliveryMethod === 'CORREIOS' ? 'Correios' : 'Em Mãos'}
          </Text>
        </View>
        <Text style={{ color: '#D4AF37', fontWeight: '700', fontSize: 14 }}>
          {(order.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </Text>
      </View>
    </Pressable>
  );
}

export function OrdersScreen({ navigation }: Props) {
  const currentUser = useAuthStore((s) => s.user);

  const [allOrders, setAllOrders] = useState<OrderPublic[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('buying');

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      OrdersApi.listMine()
        .then(setAllOrders)
        .catch(() => { /* silently ignore */ })
        .finally(() => setLoading(false));
    }, []),
  );

  const buyingOrders  = allOrders.filter((o) => o.buyerId === currentUser?.userId);
  const sellingOrders = allOrders.filter((o) => o.sellerId === currentUser?.userId);
  const displayed     = activeTab === 'buying' ? buyingOrders : sellingOrders;

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
          Meus Pedidos
        </Text>
      </View>

      {/* Toggle tabs */}
      <View style={{
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 4,
        margin: 16,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
      }}>
        {([
          { key: 'buying' as TabKey, label: 'Comprando' },
          { key: 'selling' as TabKey, label: 'Vendendo' },
        ] as const).map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setActiveTab(key)}
            style={{
              flex: 1,
              backgroundColor: activeTab === key ? '#D4AF37' : 'transparent',
              borderRadius: 10,
              padding: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: activeTab === key ? '#211B15' : 'rgba(234,234,234,0.5)',
              fontWeight: activeTab === key ? '700' : '400',
              fontSize: 14,
            }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#335336" />
        </View>
      ) : displayed.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Package size={32} color="rgba(234,234,234,0.35)" style={{ marginBottom: 12 }} />
          <Text style={{ color: '#EAEAEA', fontWeight: '700', fontSize: 16, marginBottom: 6, textAlign: 'center' }}>
            Nenhum pedido ainda
          </Text>
          <Text style={{ color: 'rgba(234,234,234,0.5)', fontSize: 14, textAlign: 'center' }}>
            {activeTab === 'buying'
              ? 'Suas compras aparecerão aqui'
              : 'Suas vendas aparecerão aqui'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}>
          {displayed.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onPress={() => navigation.navigate('OrderDetail', { orderId: order.orderId })}
            />
          ))}
        </ScrollView>
      )}

    </SafeAreaView>
  );
}
