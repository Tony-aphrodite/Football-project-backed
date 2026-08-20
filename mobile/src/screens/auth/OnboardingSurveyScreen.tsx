import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UsersApi } from '../../api/users';
import { useAuthStore } from '../../store/auth.store';
import { colors } from '../../theme/colors';
import { webAlert } from '../../utils/webAlert';

interface Question {
  id: string;
  label: string;
  options: { label: string; value: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: 'profile',
    label: 'Você é colecionador, lojista ou ambos?',
    options: [
      { label: 'Colecionador', value: 'colecionador' },
      { label: 'Lojista',      value: 'lojista' },
      { label: 'Ambos',        value: 'ambos' },
    ],
  },
  {
    id: 'collectionSize',
    label: 'Quantas camisas você possui na sua coleção pessoal?',
    options: [
      { label: 'Até 50 camisas',       value: 'ate_50' },
      { label: 'De 51 a 100 camisas',  value: '51_100' },
      { label: 'De 101 a 200 camisas', value: '101_200' },
      { label: 'Mais de 200 camisas',  value: '200_plus' },
    ],
  },
  {
    id: 'storeSize',
    label: 'Quantas camisas você possui na sua loja?',
    options: [
      { label: 'Até 50 camisas',       value: 'ate_50' },
      { label: 'De 51 a 100 camisas',  value: '51_100' },
      { label: 'De 101 a 200 camisas', value: '101_200' },
      { label: 'Mais de 200 camisas',  value: '200_plus' },
    ],
  },
  {
    id: 'buyPerMonth',
    label: 'Quantas camisas, em média, você compra por mês?',
    options: [
      { label: 'Até 3 camisas',       value: 'ate_3' },
      { label: 'De 4 a 10 camisas',   value: '4_10' },
      { label: 'De 11 a 20 camisas',  value: '11_20' },
      { label: 'Mais de 20 camisas',  value: '20_plus' },
    ],
  },
  {
    id: 'sellPerMonth',
    label: 'Quantas camisas, em média, você vende por mês?',
    options: [
      { label: 'Até 3 camisas',       value: 'ate_3' },
      { label: 'De 4 a 10 camisas',   value: '4_10' },
      { label: 'De 11 a 20 camisas',  value: '11_20' },
      { label: 'Mais de 20 camisas',  value: '20_plus' },
    ],
  },
];

export function OnboardingSurveyScreen() {
  const setUser = useAuthStore((s) => s.setUser);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = QUESTIONS.every((q) => answers[q.id]);

  const select = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const updated = await UsersApi.submitSurvey({
        profile:        answers['profile']!,
        collectionSize: answers['collectionSize']!,
        storeSize:      answers['storeSize']!,
        buyPerMonth:    answers['buyPerMonth']!,
        sellPerMonth:   answers['sellPerMonth']!,
      });
      setUser(updated);
    } catch {
      webAlert('Erro', 'Não foi possível salvar suas respostas. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.arenaFundo }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{
            color: colors.arenaDourado,
            fontWeight: '900',
            fontSize: 12,
            letterSpacing: 3,
            marginBottom: 10,
          }}>
            PERFIL DO COLECIONADOR
          </Text>
          <Text style={{
            color: '#EAEAEA',
            fontWeight: '800',
            fontSize: 24,
            lineHeight: 32,
          }}>
            Nos conte um pouco sobre você
          </Text>
          <Text style={{
            color: 'rgba(234,234,234,0.55)',
            fontSize: 14,
            marginTop: 8,
            lineHeight: 20,
          }}>
            Suas respostas nos ajudam a melhorar a experiência no app.
          </Text>
        </View>

        {/* Questions */}
        {QUESTIONS.map((q, qi) => (
          <View key={q.id} style={{ marginBottom: 28 }}>
            {/* Question number + label */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <View style={{
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: answers[q.id] ? colors.arenaDourado : colors.arenaVerde,
                alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                <Text style={{ color: answers[q.id] ? '#1C1A14' : '#fff', fontWeight: '800', fontSize: 12 }}>
                  {qi + 1}
                </Text>
              </View>
              <Text style={{
                flex: 1,
                color: '#EAEAEA',
                fontWeight: '700',
                fontSize: 15,
                lineHeight: 22,
              }}>
                {q.label}
              </Text>
            </View>

            {/* Options */}
            <View style={{ gap: 8 }}>
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => select(q.id, opt.value)}
                    style={({ pressed }) => ({
                      backgroundColor: selected ? colors.arenaVerde : 'rgba(255,255,255,0.06)',
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: selected ? colors.arenaDourado : 'rgba(255,255,255,0.12)',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      borderWidth: 2,
                      borderColor: selected ? colors.arenaDourado : 'rgba(255,255,255,0.3)',
                      backgroundColor: selected ? colors.arenaDourado : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && (
                        <View style={{
                          width: 8, height: 8, borderRadius: 4,
                          backgroundColor: '#1C1A14',
                        }} />
                      )}
                    </View>
                    <Text style={{
                      color: selected ? '#EAEAEA' : 'rgba(234,234,234,0.7)',
                      fontWeight: selected ? '700' : '400',
                      fontSize: 15,
                      flex: 1,
                    }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* Progress dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24 }}>
          {QUESTIONS.map((q) => (
            <View key={q.id} style={{
              width: answers[q.id] ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: answers[q.id] ? colors.arenaDourado : 'rgba(255,255,255,0.2)',
            }} />
          ))}
        </View>
      </ScrollView>

      {/* Submit — fixed at bottom so it's always reachable */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12, backgroundColor: colors.arenaFundo }}>
        {!allAnswered && (
          <Text style={{ textAlign: 'center', color: 'rgba(234,234,234,0.4)', fontSize: 12, marginBottom: 8 }}>
            {QUESTIONS.filter((q) => !answers[q.id]).length} pergunta{QUESTIONS.filter((q) => !answers[q.id]).length !== 1 ? 's' : ''} ainda sem resposta
          </Text>
        )}
        <Pressable
          onPress={handleSubmit}
          disabled={!allAnswered || submitting}
          style={({ pressed }) => ({
            backgroundColor: allAnswered ? colors.arenaDourado : 'rgba(255,255,255,0.1)',
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {submitting
            ? <ActivityIndicator color="#1C1A14" />
            : (
              <Text style={{
                color: allAnswered ? '#1C1A14' : 'rgba(234,234,234,0.35)',
                fontWeight: '800',
                fontSize: 16,
              }}>
                Continuar
              </Text>
            )
          }
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
