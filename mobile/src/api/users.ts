import { api } from './client';
import type { PublicUser } from '../store/auth.store';

export interface FinanceiroBalance {
  available: number;
  waitingFunds: number;
  hasRecipient: boolean;
}

export interface WithdrawalItem {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
}

export const UsersApi = {
  getMe(): Promise<PublicUser> {
    return api.get('/users/me').then((r) => r.data as PublicUser);
  },
  updateSellerCep(cep: string, rua?: string, numero?: string, cidade?: string, estado?: string): Promise<PublicUser> {
    return api.patch('/users/me/cep', { cep, rua, numero, cidade, estado }).then((r) => r.data as PublicUser);
  },
  updatePushToken(token: string): Promise<void> {
    return api.patch('/users/me/push-token', { token }).then(() => undefined);
  },
  updateDadosPessoais(nomeCompleto: string, email: string): Promise<PublicUser> {
    return api.post('/users/me/dados-pessoais', { nomeCompleto, email }).then((r) => r.data as PublicUser);
  },
  updateBankData(data: {
    bankCode: string;
    bankAgency: string;
    bankAgencyDigit?: string;
    bankAccount: string;
    bankAccountDigit: string;
  }): Promise<PublicUser> {
    return api.post('/users/me/financeiro/bank', data).then((r) => r.data as PublicUser);
  },
  getFinanceiroBalance(): Promise<FinanceiroBalance> {
    return api.get('/users/me/financeiro/balance').then((r) => r.data as FinanceiroBalance);
  },
  sacar(amountCents: number): Promise<{ id: string; status: string; amount: number }> {
    return api.post('/users/me/financeiro/sacar', { amountCents }).then((r) => r.data as { id: string; status: string; amount: number });
  },
  getWithdrawals(): Promise<WithdrawalItem[]> {
    return api.get('/users/me/financeiro/withdrawals').then((r) => r.data as WithdrawalItem[]);
  },
  submitSurvey(data: {
    profile: string;
    collectionSize: string;
    storeSize: string;
    buyPerMonth: string;
    sellPerMonth: string;
  }): Promise<PublicUser> {
    return api.post('/users/me/survey', data).then((r) => r.data as PublicUser);
  },
};
