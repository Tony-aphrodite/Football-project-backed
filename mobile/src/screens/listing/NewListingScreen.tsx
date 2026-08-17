import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { webAlert, webConfirm } from '../../utils/webAlert';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { Camera, X } from 'lucide-react-native';

import { ListingsApi, type JerseyImageResult } from '../../api/listings';
import { useAuthStore } from '../../store/auth.store';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

const MAX_PHOTOS = 8;

// ── Constants ─────────────────────────────────────────────────────────────────

const VERIFIED_SUPPLIERS = ['NIKE', 'ADIDAS', 'PUMA', 'NEW_BALANCE'];

const COUNTRIES: Record<string, string[]> = {
  AMERICA: [
    'Argentina', 'Bolívia', 'Brasil', 'Canadá', 'Chile', 'Colômbia',
    'Costa Rica', 'Cuba', 'El Salvador', 'Equador', 'Estados Unidos',
    'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'México', 'Nicarágua',
    'Panamá', 'Paraguai', 'Peru', 'República Dominicana', 'Trinidad e Tobago',
    'Uruguai', 'Venezuela',
  ],
  EUROPA: [
    'Albânia', 'Alemanha', 'Andorra', 'Áustria', 'Azerbaijão', 'Belarus',
    'Bélgica', 'Bósnia e Herzegovina', 'Bulgária', 'Chipre', 'Croácia',
    'Dinamarca', 'Escócia', 'Eslováquia', 'Eslovênia', 'Espanha',
    'Finlândia', 'França', 'Gales', 'Geórgia', 'Grécia', 'Hungria',
    'Inglaterra', 'Irlanda', 'Irlanda do Norte', 'Islândia', 'Israel',
    'Itália', 'Kosovo', 'Letônia', 'Liechtenstein', 'Lituânia',
    'Luxemburgo', 'Malta', 'Moldova', 'Montenegro', 'Noruega',
    'Países Baixos', 'Polônia', 'Portugal', 'República Checa', 'Romênia',
    'Rússia', 'San Marino', 'Sérvia', 'Suécia', 'Suíça', 'Turquia',
    'Ucrânia',
  ],
  ASIA: [
    'Afeganistão', 'Arábia Saudita', 'Armênia', 'Bahrein', 'Bangladesh',
    'Camboja', 'China', 'Coreia do Norte', 'Coreia do Sul', 'Emirados Árabes',
    'Filipinas', 'Índia', 'Indonésia', 'Irã', 'Iraque', 'Japão',
    'Jordânia', 'Kuwait', 'Líbano', 'Malásia', 'Maldivas', 'Mianmar',
    'Nepal', 'Omã', 'Paquistão', 'Palestina', 'Qatar', 'Singapura',
    'Síria', 'Sri Lanka', 'Tailândia', 'Tajiquistão', 'Timor-Leste',
    'Uzbequistão', 'Vietnã', 'Iémen',
  ],
  AFRICA: [
    'África do Sul', 'Algéria', 'Angola', 'Benin', 'Botsuana',
    'Burkina Faso', 'Burundi', 'Cabo Verde', 'Camarões', 'Chade',
    'Comores', 'Congo', 'Costa do Marfim', 'Egito', 'Eritreia',
    'Etiópia', 'Gabão', 'Gâmbia', 'Gana', 'Guiné', 'Guiné Equatorial',
    'Guiné-Bissau', 'Lesoto', 'Libéria', 'Líbia', 'Madagascar',
    'Malawi', 'Mali', 'Marrocos', 'Mauritânia', 'Moçambique', 'Namíbia',
    'Níger', 'Nigéria', 'Quênia', 'Ruanda', 'Senegal', 'Serra Leoa',
    'Somália', 'Sudão', 'Sudão do Sul', 'Tanzânia', 'Togo', 'Tunísia',
    'Uganda', 'Zâmbia', 'Zimbábue',
  ],
  OCEANIA: [
    'Austrália', 'Fiji', 'Ilhas Cook', 'Ilhas Salomão', 'Nova Caledônia',
    'Nova Zelândia', 'Papua-Nova Guiné', 'Samoa', 'Tonga', 'Vanuatu',
  ],
};

const CONTINENTS = [
  { value: 'AMERICA', label: 'América' },
  { value: 'EUROPA',  label: 'Europa' },
  { value: 'ASIA',    label: 'Ásia' },
  { value: 'AFRICA',  label: 'África' },
  { value: 'OCEANIA', label: 'Oceania' },
];

const SUPPLIERS = [
  { value: 'NIKE',           label: 'Nike' },
  { value: 'ADIDAS',         label: 'Adidas' },
  { value: 'PUMA',           label: 'Puma' },
  { value: 'UMBRO',          label: 'Umbro' },
  { value: 'KAPPA',          label: 'Kappa' },
  { value: 'LE_COQ_SPORTIF', label: 'Le Coq Sportif' },
  { value: 'NEW_BALANCE',    label: 'New Balance' },
  { value: 'UNDER_ARMOUR',   label: 'Under Armour' },
  { value: 'PENALTY',        label: 'Penalty' },
  { value: 'TOPPER',         label: 'Topper' },
  { value: 'REUSCH',         label: 'Reusch' },
  { value: 'LOTTO',          label: 'Lotto' },
  { value: 'OUTRO',          label: 'Outro' },
];

const MODELS = [
  { value: 'TITULAR',      label: 'Titular' },
  { value: 'RESERVA',      label: 'Reserva' },
  { value: 'TERCEIRA',     label: 'Terceira' },
  { value: 'GOLEIRO',      label: 'Goleiro' },
  { value: 'TREINO',       label: 'Treino' },
  { value: 'COMEMORATIVA', label: 'Comemorativa' },
];

const CONDITIONS = [
  { value: 'COM_ETIQUETA', label: 'Com etiqueta', desc: 'Nunca usada, com etiqueta original do fabricante ainda fixada.' },
  { value: 'PERFEITA',     label: 'Perfeita',     desc: 'Sem nenhum sinal de uso. Estado impecável, indistinguível de nova.' },
  { value: 'EXCELENTE',    label: 'Excelente',    desc: 'Pouquíssimos sinais de uso, alguns pequenos fios puxados ou bolinhas.' },
  { value: 'BOA',          label: 'Boa',          desc: 'Fios puxados e bolinhas notáveis, desgastes no patrocínio ou número nas costas.' },
  { value: 'REGULAR',      label: 'Regular',      desc: 'Necessário reforma, pode possuír defeitos no tecido ou estar sem patrocínio ou número.' },
  { value: 'DESGASTADA',   label: 'Desgastada',   desc: 'Uso intenso. Apresenta defeitos, manchas ou desgaste visíveis.' },
];

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG', '2XGG', '3XGG'];
const STEPS = ['Detalhes', 'Fornecedora', 'Revisar'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const ERR_COLOR  = '#EF4444';
const ERR_BG     = 'rgba(239,68,68,0.06)';
const ERR_BORDER = 'rgba(239,68,68,0.4)';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text style={{ color: ERR_COLOR, fontSize: 12, marginTop: 4, marginLeft: 2 }}>
      ⚠ {message}
    </Text>
  );
}

function SectionTitle({ text, error }: { text: string; error?: boolean }) {
  return (
    <Text style={{
      fontSize: 11, fontWeight: '700', letterSpacing: 1,
      marginTop: 20, marginBottom: 8,
      color: error ? ERR_COLOR : 'rgba(255,255,255,0.55)',
    }}>
      {text}{error ? '  ←  obrigatório' : ''}
    </Text>
  );
}

function RadioGroup({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => { Keyboard.dismiss(); onChange(o.value); }}
            style={{
              flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
              backgroundColor: active ? '#D4AF37' : '#EFEFEF',
              borderWidth: 1,
              borderColor: active ? '#D4AF37' : '#E5DCC4',
            }}
          >
            <Text style={{ color: active ? '#1C1A14' : '#5C5547', fontWeight: '700', fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SelectField({ label, value, placeholder, options, onChange, error, disabled }: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string; desc?: string }[];
  onChange: (v: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => { if (!disabled) { Keyboard.dismiss(); setOpen(true); } }}
        style={{
          borderRadius: 12, padding: 14,
          borderWidth: 1,
          borderColor: error ? ERR_BORDER : '#E5DCC4',
          backgroundColor: error ? ERR_BG : '#fff',
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: error ? ERR_COLOR : '#9C9486', fontSize: 11, marginBottom: 2 }}>
            {label}
          </Text>
          <Text style={{ color: selected ? '#1C1A14' : (error ? ERR_COLOR : '#9C9486'), fontSize: 15, fontWeight: selected ? '600' : '400' }}>
            {selected ? selected.label : placeholder}
          </Text>
        </View>
        <Text style={{ color: error ? ERR_COLOR : '#9C9486', fontSize: 18 }}>›</Text>
      </Pressable>
      {error && <FieldError message="Selecione uma opção" />}

      <Modal visible={open} animationType="slide" transparent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#EFEFEF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: '#1C1A14' }}>{label}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={{ color: '#9C9486', fontSize: 15 }}>Fechar</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onChange(item.value); setOpen(false); Keyboard.dismiss(); }}
                style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#EFEFEF', backgroundColor: value === item.value ? '#EFEFEF' : '#fff' }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 15, color: '#1C1A14', fontWeight: value === item.value ? '700' : '400' }}>
                    {item.label}
                  </Text>
                  {item.desc ? (
                    <Text style={{ fontSize: 12, color: '#9C9486', marginTop: 2, lineHeight: 16 }}>
                      {item.desc}
                    </Text>
                  ) : null}
                </View>
                {value === item.value && <Text style={{ color: '#335336', fontSize: 18 }}>✓</Text>}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

function SizeGrid({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  return (
    <>
      <View style={{
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        padding: error ? 10 : 0,
        borderRadius: 12,
        borderWidth: error ? 1 : 0,
        borderColor: error ? ERR_BORDER : 'transparent',
        backgroundColor: error ? ERR_BG : 'transparent',
      }}>
        {SIZES.map((s) => {
          const active = value === s;
          return (
            <Pressable
              key={s}
              onPress={() => { Keyboard.dismiss(); onChange(s); }}
              style={{
                paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
                backgroundColor: active ? '#D4AF37' : '#EFEFEF',
                borderWidth: 1, borderColor: active ? '#D4AF37' : '#E5DCC4',
              }}
            >
              <Text style={{ color: active ? '#1C1A14' : '#5C5547', fontWeight: '700', fontSize: 13 }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <FieldError message="Selecione um tamanho" />}
    </>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  kind: 'TIME' | 'SELECAO';
  teamName: string;
  continent: string;
  country: string;
  season: string;
  supplier: string;
  model: string;
  garmentType: 'LOJA' | 'JOGO';
  size: string;
  condition: string;
  gender: 'MASCULINO' | 'FEMININO';
  priceText: string;
  description: string;
  weightGrams: string;
  sku: string;
  nonVerifiedAck: boolean;
}

const INITIAL: FormState = {
  kind: 'TIME', teamName: '', continent: '', country: '', season: '',
  supplier: '', model: '', garmentType: 'LOJA', size: '', condition: '',
  gender: 'MASCULINO', priceText: '', description: '', weightGrams: '300',
  sku: '', nonVerifiedAck: false,
};

// ── Main screen ───────────────────────────────────────────────────────────────

export function NewListingScreen() {
  const [form, setForm]         = useState<FormState>(INITIAL);
  const [busy, setBusy]         = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess]           = useState(false);
  const [skuImages, setSkuImages]               = useState<JerseyImageResult[]>([]);
  const [skuSearching, setSkuSearching]         = useState(false);
  const skuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef               = useRef<ScrollView>(null);
  const submittedRef            = useRef(false);
  const currentUser             = useAuthStore((s) => s.user);
  const setListingsCount        = useAuthStore((s) => s.setListingsActiveCount);
  const nav                     = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const rootNav                 = useNavigation<NavigationProp<RootStackParamList>>();

  // Reset form when returning to this tab after a successful submission
  useFocusEffect(
    useCallback(() => {
      if (submittedRef.current) {
        setForm(INITIAL);
        setPhotoUris([]);
        setPhotoKeys([]);
        setCreatedListingId(null);
        setAttempted(false);
        setShowSuccess(false);
        submittedRef.current = false;
      }
    }, []),
  );

  async function pickAndUpload(slotIndex: number) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      webAlert('Permissão necessária', 'Permita o acesso à galeria nas configurações.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotoUris((prev) => {
      const next = [...prev];
      next[slotIndex] = asset.uri;
      return next;
    });
  }

  function removePhoto(slotIndex: number) {
    setPhotoUris((prev) => prev.filter((_, i) => i !== slotIndex));
    setPhotoKeys((prev) => prev.filter((_, i) => i !== slotIndex));
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setAttempted(false);
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Continent change → reset country + season (season format may change)
      if (key === 'continent') { next.country = ''; next.season = ''; }
      // Kind change → reset season (SELECAO uses European format)
      if (key === 'kind') { next.season = ''; }
      return next;
    });
  }

  const countryOptions = form.continent
    ? (COUNTRIES[form.continent] ?? []).map((c) => ({ value: c, label: c }))
    : [];

  // European format for EUROPA continent or national teams (SELECAO)
  const isEuropeanSeason = form.continent === 'EUROPA' || form.kind === 'SELECAO';

  const seasonOptions = (() => {
    // Newest first; range 1990–2026 covers vintage and upcoming seasons
    const years: number[] = [];
    for (let y = 2026; y >= 1990; y--) years.push(y);
    if (isEuropeanSeason) {
      return years.map((y) => {
        const label = `${y}/${String(y + 1).slice(2)}`;
        return { value: label, label };
      });
    }
    return years.map((y) => ({ value: String(y), label: String(y) }));
  })();

  const isVerifiedSupplier = VERIFIED_SUPPLIERS.includes(form.supplier);

  const triggerSkuSearch = (supplier: string, sku: string) => {
    if (skuTimer.current) clearTimeout(skuTimer.current);
    if (!supplier || sku.trim().length < 3) { setSkuImages([]); return; }
    skuTimer.current = setTimeout(async () => {
      setSkuSearching(true);
      try {
        const results = await ListingsApi.searchJerseyImage(supplier, sku.trim());
        setSkuImages(results);
      } catch { setSkuImages([]); } finally { setSkuSearching(false); }
    }, 700);
  };

  // Validation map — each key = true if that field has an error
  const errors = {
    teamName:  form.teamName.trim().length < 2,
    continent: form.continent === '',
    country:   form.country === '',

    supplier:  form.supplier === '',
    model:     form.model === '',
    size:      form.size === '',
    condition: form.condition === '',
    price:     form.priceText === '' || Number(form.priceText.replace(',', '.')) < 1,
    ack:       form.supplier !== '' && !isVerifiedSupplier && !form.nonVerifiedAck,
  };

  const hasErrors = Object.values(errors).some(Boolean);

  // Count how many fields are still missing
  const missingCount = Object.values(errors).filter(Boolean).length;

  const onSubmit = async () => {
    if (!currentUser?.cpf) {
      webConfirm(
        'CPF necessário',
        'Para publicar um anúncio, preencha seu CPF em Dados Pessoais antes de continuar.',
        () => rootNav.navigate('DadosPessoais'),
        undefined,
        'Ir para Dados Pessoais',
      );
      return;
    }
    if (hasErrors) {
      setAttempted(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const priceCents = Math.round(parseFloat(form.priceText.replace(',', '.')) * 100);
    setBusy(true);
    try {
      const result = await ListingsApi.create({
        kind: form.kind,
        teamName: form.teamName.trim(),
        continent: form.continent as 'AMERICA' | 'EUROPA' | 'ASIA' | 'AFRICA' | 'OCEANIA',
        country: form.country,
        season: form.season || undefined,
        supplier: form.supplier,
        model: form.model,
        garmentType: form.garmentType,
        size: form.size,
        condition: form.condition,
        gender: form.gender,
        priceCents,
        description: form.description.trim() || undefined,
        weightGrams: form.weightGrams ? parseInt(form.weightGrams, 10) : undefined,
        sku: form.sku.trim() || undefined,
        nonVerifiedSupplierAck: form.nonVerifiedAck,
      });

      const listingId = result.listing.listingId;

      // Upload any pre-selected photos
      for (let i = 0; i < photoUris.length; i++) {
        if (!photoUris[i]) continue;
        try {
          setUploadingIdx(i);
          const uri  = photoUris[i];
          const ext  = (uri.split('.').pop() ?? 'jpg').toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          const { uploadUrl, key } = await ListingsApi.presignPhoto(listingId, mime);
          const blob = await fetch(uri).then((r) => r.blob());
          await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
          await ListingsApi.confirmPhoto(listingId, key);
          setPhotoKeys((prev) => { const next = [...prev]; next[i] = key; return next; });
        } catch { /* skip failed photo */ }
      }
      setUploadingIdx(null);

      setListingsCount(result.listingsActiveCount);
      setCreatedListingId(listingId);
      setShowSuccess(true);
      submittedRef.current = true;
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch {
      webAlert('Erro', 'Não foi possível publicar o anúncio. Verifique sua conexão.');
    } finally {
      setBusy(false);
      setUploadingIdx(null);
    }
  };

  const e = attempted ? errors : {} as typeof errors;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: '#3c3c3c' }}>

      {/* Step indicator */}
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#E5DCC4' }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {STEPS.map((label, i) => (
            <View key={label} style={{ flex: 1 }}>
              <View style={{ height: 4, borderRadius: 999, backgroundColor: i === 0 ? '#335336' : '#E5DCC4' }} />
              <Text style={{ fontSize: 10, marginTop: 4, fontWeight: i === 0 ? '700' : '400', color: i === 0 ? '#335336' : '#9C9486' }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onTouchStart={() => setAttempted(false)}
      >

        {/* Success banner — shown after listing is created */}
        {showSuccess && (
          <View style={{
            backgroundColor: '#dcfce7', borderRadius: 14,
            padding: 16, marginBottom: 16,
            borderWidth: 1, borderColor: '#22c55e',
          }}>
            <Text style={{ color: '#166534', fontWeight: '800', fontSize: 16, marginBottom: 4 }}>
              ✅ Anúncio publicado!
            </Text>
            <Text style={{ color: '#166534', fontSize: 13, marginBottom: 12 }}>
              Agora adicione fotos para atrair mais compradores. Quando terminar, clique em "Ver meus anúncios".
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setForm(INITIAL);
                  setPhotoUris([]);
                  setPhotoKeys([]);
                  setCreatedListingId(null);
                  setAttempted(false);
                  setShowSuccess(false);
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: pressed ? '#d1fae5' : '#fff',
                  borderWidth: 1, borderColor: '#22c55e',
                  borderRadius: 10, paddingVertical: 14, alignItems: 'center',
                })}
              >
                <Text style={{ color: '#166534', fontWeight: '700', fontSize: 15 }}>
                  + Anunciar outra
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setForm(INITIAL);
                  setPhotoUris([]);
                  setPhotoKeys([]);
                  setCreatedListingId(null);
                  setAttempted(false);
                  setShowSuccess(false);
                  nav.navigate('Home');
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: pressed ? '#B8962B' : '#D4AF37',
                  borderRadius: 10, paddingVertical: 14, alignItems: 'center',
                })}
              >
                <Text style={{ color: '#211B15', fontWeight: '700', fontSize: 15 }}>
                  Ver anúncios →
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Error summary banner */}
        {attempted && hasErrors && (
          <View style={{
            backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 14,
            borderWidth: 1, borderColor: ERR_BORDER, marginBottom: 4,
          }}>
            <Text style={{ color: ERR_COLOR, fontWeight: '700', fontSize: 13 }}>
              {missingCount} {missingCount === 1 ? 'campo obrigatório' : 'campos obrigatórios'} não preenchido{missingCount !== 1 ? 's' : ''}
            </Text>
            <Text style={{ color: '#5C5547', fontSize: 12, marginTop: 4 }}>
              Os campos marcados em vermelho precisam ser preenchidos.
            </Text>
          </View>
        )}

        {/* Fotos */}
        <SectionTitle text={`FOTOS (${photoUris.length}/${MAX_PHOTOS})`} />

        {/* Main photo slot */}
        {(() => {
          const hasPhoto = !!photoUris[0];
          const isUploading = uploadingIdx === 0;
          return (
            <Pressable
              onPress={() => hasPhoto ? removePhoto(0) : pickAndUpload(0)}
              disabled={isUploading}
              style={{
                width: '100%', aspectRatio: 2.2,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: hasPhoto ? '#D4AF37' : '#E5DCC4',
                borderStyle: hasPhoto ? 'solid' : 'dashed',
                backgroundColor: '#fff', overflow: 'hidden',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              {isUploading ? <ActivityIndicator color="#335336" /> : hasPhoto ? (
                <>
                  <Image source={{ uri: photoUris[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3 }}>
                    <X size={12} color="#fff" />
                  </View>
                </>
              ) : (
                <>
                  <Camera size={32} color="#9C9486" />
                  <Text style={{ color: '#9C9486', fontSize: 13, fontWeight: '600', marginTop: 6 }}>Foto principal</Text>
                </>
              )}
            </Pressable>
          );
        })()}

        {/* Secondary named slots */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { idx: 1, label: 'Foto costas', gold: false },
            { idx: 2, label: 'Foto etiqueta', gold: false },
            { idx: 3, label: 'Mais fotos', gold: true },
          ].map(({ idx, label, gold }) => {
            const hasPhoto = !!photoUris[idx];
            const isUploading = uploadingIdx === idx;
            return (
              <Pressable
                key={idx}
                onPress={() => hasPhoto ? removePhoto(idx) : pickAndUpload(idx)}
                disabled={isUploading}
                style={{
                  flex: 1, aspectRatio: 1,
                  borderRadius: 12, borderWidth: 1.5,
                  borderColor: hasPhoto ? '#D4AF37' : gold ? '#D4AF37' : '#E5DCC4',
                  borderStyle: hasPhoto ? 'solid' : 'dashed',
                  backgroundColor: '#fff', overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isUploading ? <ActivityIndicator color="#335336" /> : hasPhoto ? (
                  <>
                    <Image source={{ uri: photoUris[idx] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 2 }}>
                      <X size={10} color="#fff" />
                    </View>
                  </>
                ) : (
                  <>
                    <Camera size={20} color={gold ? '#D4AF37' : '#9C9486'} />
                    <Text style={{ color: gold ? '#D4AF37' : '#9C9486', fontSize: 10, fontWeight: gold ? '700' : '400', marginTop: 4, textAlign: 'center' }}>
                      {label}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Extra slots (4-7) shown when slot 3 is filled */}
        {photoUris.length >= 4 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {Array.from({ length: Math.min(MAX_PHOTOS - 4, photoUris.length - 3 + 1) }).map((_, j) => {
              const i = j + 4;
              const hasPhoto = !!photoUris[i];
              const isUploading = uploadingIdx === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => hasPhoto ? removePhoto(i) : pickAndUpload(i)}
                  disabled={isUploading}
                  style={{
                    width: '23%', aspectRatio: 1,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: hasPhoto ? '#D4AF37' : '#E5DCC4',
                    borderStyle: hasPhoto ? 'solid' : 'dashed',
                    backgroundColor: '#fff', overflow: 'hidden',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isUploading ? <ActivityIndicator color="#335336" /> : hasPhoto ? (
                    <>
                      <Image source={{ uri: photoUris[i] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 2 }}>
                        <X size={10} color="#fff" />
                      </View>
                    </>
                  ) : (
                    <Camera size={16} color="#9C9486" />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 6 }}>
          Toque para adicionar · Toque na foto para remover · Máx. {MAX_PHOTOS} fotos
        </Text>

        {/* Time ou Seleção */}
        <SectionTitle text="TIME OU SELEÇÃO" />
        <RadioGroup
          options={[{ value: 'TIME', label: 'Time' }, { value: 'SELECAO', label: 'Seleção' }]}
          value={form.kind}
          onChange={(v) => set('kind', v as 'TIME' | 'SELECAO')}
        />

        {/* Nome do time / País */}
        <SectionTitle
          text={form.kind === 'SELECAO' ? 'PAÍS' : 'NOME DO TIME'}
          error={e.teamName}
        />
        <TextInput
          value={form.teamName}
          onChangeText={(t) => set('teamName', t)}
          placeholder={form.kind === 'SELECAO' ? 'ex: Brasil, Argentina, França...' : 'ex: Flamengo, Real Madrid...'}
          placeholderTextColor={e.teamName ? ERR_COLOR : '#9C9486'}
          style={{
            borderRadius: 12, padding: 14, fontSize: 15, color: '#1C1A14',
            borderWidth: 1,
            borderColor: e.teamName ? ERR_BORDER : '#E5DCC4',
            backgroundColor: e.teamName ? ERR_BG : '#fff',
          }}
        />
        {e.teamName && (
          <FieldError
            message={form.kind === 'SELECAO'
              ? 'Digite o nome do país (mín. 2 caracteres)'
              : 'Digite o nome do time (mín. 2 caracteres)'
            }
          />
        )}

        {/* Continente */}
        <SectionTitle text="CONTINENTE" error={e.continent} />
        <SelectField
          label="Continente"
          value={form.continent}
          placeholder="Selecione..."
          options={CONTINENTS}
          onChange={(v) => set('continent', v)}
          error={e.continent}
        />

        {/* País */}
        <SectionTitle text="PAÍS" error={e.country} />
        <SelectField
          label="País"
          value={form.country}
          placeholder={form.continent ? 'Selecione...' : 'Selecione o continente primeiro'}
          options={countryOptions}
          onChange={(v) => set('country', v)}
          error={e.country}
          disabled={!form.continent}
        />

        {/* Temporada — opcional */}
        <SectionTitle text="TEMPORADA (OPCIONAL)" />
        <Text style={{ color: '#9C9486', fontSize: 11, marginBottom: 8 }}>
          {isEuropeanSeason
            ? 'Formato: 2023/24, 2024/25… (Europa e Seleções)'
            : 'Formato: 2023, 2024… (clubes fora da Europa)'}
        </Text>
        <SelectField
          label="Temporada"
          value={form.season}
          placeholder="Selecione (opcional)..."
          options={seasonOptions}
          onChange={(v) => set('season', v)}
        />

        {/* Fornecedora */}
        <SectionTitle text="FORNECEDORA" error={e.supplier} />
        <SelectField
          label="Fornecedora"
          value={form.supplier}
          placeholder="Selecione..."
          options={SUPPLIERS}
          onChange={(v) => { set('supplier', v); triggerSkuSearch(v, form.sku); }}
          error={e.supplier}
        />

        {/* SKU Code */}
        {form.supplier !== '' && (
          <View style={{ marginTop: 12 }}>
            <SectionTitle text="CÓDIGO SKU (opcional)" />
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TextInput
                value={form.sku}
                onChangeText={(t) => { set('sku', t); triggerSkuSearch(form.supplier, t); }}
                placeholder="ex: DV9436-410, DN0680-012..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoCapitalize="characters"
                style={{
                  flex: 1, borderWidth: 1, borderColor: '#E5DCC4', borderRadius: 10,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
                  color: '#1C1A14', backgroundColor: '#fff',
                }}
              />
              {skuSearching && <ActivityIndicator color="#D4AF37" size="small" />}
            </View>

            {/* Image results */}
            {skuImages.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
                  IMAGENS ENCONTRADAS — toque para usar
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                  {skuImages.map((img, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        if (!photoUris.includes(img.url)) {
                          setPhotoUris((prev) => {
                            const next = [...prev];
                            const emptySlot = next.findIndex((u) => !u);
                            if (emptySlot >= 0) { next[emptySlot] = img.url; return next; }
                            return prev.length < 8 ? [...prev, img.url] : prev;
                          });
                        }
                      }}
                      style={{ marginHorizontal: 4 }}
                    >
                      <Image
                        source={{ uri: img.thumbnail }}
                        style={{ width: 90, height: 90, borderRadius: 10, borderWidth: 2, borderColor: '#D4AF37' }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 6 }}>
                  Toque na imagem para adicioná-la às fotos do anúncio
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Aviso fornecedora não verificada */}
        {form.supplier !== '' && !isVerifiedSupplier && (
          <Pressable
            onPress={() => set('nonVerifiedAck', !form.nonVerifiedAck)}
            style={{
              marginTop: 8, padding: 14, borderRadius: 12,
              backgroundColor: form.nonVerifiedAck ? 'rgba(51,83,54,0.08)' : (e.ack ? ERR_BG : 'rgba(239,68,68,0.06)'),
              borderWidth: 1,
              borderColor: form.nonVerifiedAck ? '#335336' : (e.ack ? ERR_BORDER : 'rgba(239,68,68,0.3)'),
              flexDirection: 'row', gap: 10, alignItems: 'flex-start',
            }}
          >
            <Text style={{ fontSize: 18 }}>{form.nonVerifiedAck ? '☑' : '☐'}</Text>
            <Text style={{ flex: 1, fontSize: 12, color: '#5C5547', lineHeight: 18 }}>
              Essa fornecedora não possui código de verificação. Confirmo que a camisa é de procedência confiável. Em caso de contestações repetidas de originalidade, a conta poderá ser banida.
            </Text>
          </Pressable>
        )}
        {e.ack && <FieldError message="Você precisa confirmar a procedência da fornecedora" />}

        {/* Modelo */}
        <SectionTitle text="MODELO" error={e.model} />
        <SelectField
          label="Modelo"
          value={form.model}
          placeholder="Selecione..."
          options={MODELS}
          onChange={(v) => set('model', v)}
          error={e.model}
        />

        {/* Tipo de camisa */}
        <SectionTitle text="TIPO DE CAMISA" />
        <RadioGroup
          options={[{ value: 'LOJA', label: 'De loja' }, { value: 'JOGO', label: 'De jogo' }]}
          value={form.garmentType}
          onChange={(v) => set('garmentType', v as 'LOJA' | 'JOGO')}
        />

        {/* Tamanho */}
        <SectionTitle text="TAMANHO" error={e.size} />
        <SizeGrid value={form.size} onChange={(v) => set('size', v)} error={e.size} />

        {/* Condição */}
        <SectionTitle text="CONDIÇÃO" error={e.condition} />
        <SelectField
          label="Condição"
          value={form.condition}
          placeholder="Selecione..."
          options={CONDITIONS}
          onChange={(v) => set('condition', v)}
          error={e.condition}
        />

        {/* Gênero */}
        <SectionTitle text="GÊNERO" />
        <RadioGroup
          options={[{ value: 'MASCULINO', label: 'Masculino' }, { value: 'FEMININO', label: 'Feminina' }]}
          value={form.gender}
          onChange={(v) => set('gender', v as 'MASCULINO' | 'FEMININO')}
        />

        {/* Preço */}
        <SectionTitle text="PREÇO (R$)" error={e.price} />
        <TextInput
          value={form.priceText}
          onChangeText={(t) => set('priceText', t.replace(/[^0-9,\.]/g, ''))}
          placeholder="ex: 149,90"
          placeholderTextColor={e.price ? ERR_COLOR : '#9C9486'}
          keyboardType="decimal-pad"
          style={{
            borderRadius: 12, padding: 14, fontSize: 20, fontWeight: '700', color: '#1C1A14',
            borderWidth: 1,
            borderColor: e.price ? ERR_BORDER : '#E5DCC4',
            backgroundColor: e.price ? ERR_BG : '#fff',
          }}
        />
        {e.price && <FieldError message="Digite um preço válido (mín. R$ 1,00)" />}

        {/* Fee disclosure — live payout simulation */}
        {(() => {
          const v = parseFloat(form.priceText.replace(',', '.'));
          if (!form.priceText || isNaN(v) || v < 1) return null;
          const fee = v * 0.07;
          const net = v * 0.93;
          const fmt = (n: number) => n.toFixed(2).replace('.', ',');
          return (
            <View style={{
              marginTop: 8, padding: 14, borderRadius: 12,
              backgroundColor: 'rgba(212,175,55,0.08)',
              borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)',
            }}>
              <Text style={{ color: '#D4AF37', fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
                SIMULAÇÃO DE REPASSE
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Preço anunciado</Text>
                <Text style={{ color: '#EAEAEA', fontSize: 13, fontWeight: '600' }}>R$ {fmt(v)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Comissão Arena (7%)</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>− R$ {fmt(fee)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(212,175,55,0.2)', marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#D4AF37', fontSize: 14, fontWeight: '700' }}>Você recebe (via Pix)</Text>
                <Text style={{ color: '#D4AF37', fontSize: 14, fontWeight: '700' }}>R$ {fmt(net)}</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                Pagamentos por cartão de crédito têm taxa adicional do processador (até 4%). Via Pix, você recebe exatamente o valor acima.
              </Text>
            </View>
          );
        })()}

        {/* Descrição */}
        <SectionTitle text="DESCRIÇÃO / OBSERVAÇÕES (opcional)" />
        <TextInput
          value={form.description}
          onChangeText={(t) => set('description', t)}
          placeholder={
            'Ex: pequeno furo na gola, sem rasgos, lavada e passada...\n' +
            'Descreva detalhes, defeitos ou qualquer informação relevante.'
          }
          placeholderTextColor="#9C9486"
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          style={{
            borderRadius: 12,
            padding: 14,
            fontSize: 14,
            color: '#1C1A14',
            borderWidth: 1,
            borderColor: '#E5DCC4',
            backgroundColor: '#fff',
            minHeight: 110,
            lineHeight: 22,
          }}
        />
        <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
          {form.description.length}/500
        </Text>

        {/* Peso para frete */}
        <SectionTitle text="PESO PARA CÁLCULO DE FRETE (gramas)" />
        <TextInput
          value={form.weightGrams}
          onChangeText={(t) => set('weightGrams', t.replace(/\D/g, ''))}
          placeholder="300"
          keyboardType="numeric"
          style={{
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: '#1C1A14',
            borderWidth: 1,
            borderColor: '#E5DCC4',
            backgroundColor: '#fff',
          }}
        />
        <Text style={{ color: '#9C9486', fontSize: 11, marginTop: 4 }}>
          Camisa típica: 300–400g. Usado para calcular o frete via Melhor Envio.
        </Text>

      </ScrollView>

      {/* Submit button */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#3c3c3c', paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12,
        borderTopWidth: 1, borderColor: '#E5DCC4',
      }}>
        {/* Missing fields counter shown before first attempt */}
        {!attempted && hasErrors && (
          <Text style={{ textAlign: 'center', color: '#9C9486', fontSize: 12, marginBottom: 8 }}>
            {missingCount} {missingCount === 1 ? 'campo' : 'campos'} ainda {missingCount === 1 ? 'falta' : 'faltam'} preencher
          </Text>
        )}
        <Pressable
          onPress={onSubmit}
          disabled={busy || showSuccess || !!createdListingId}
          style={{
            borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            backgroundColor: (!hasErrors && !showSuccess && !createdListingId) ? '#335336' : '#9C9486',
          }}
        >
          {busy
            ? <>
                <ActivityIndicator color="#fff" />
                {uploadingIdx !== null && (
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>
                    Enviando foto {uploadingIdx + 1} de {photoUris.length}...
                  </Text>
                )}
              </>
            : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {hasErrors ? `Publicar anúncio (${missingCount} campo${missingCount !== 1 ? 's' : ''})` : 'Publicar anúncio ✓'}
              </Text>
          }
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
