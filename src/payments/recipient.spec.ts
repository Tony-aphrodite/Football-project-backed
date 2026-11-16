import { PagarmeService } from './pagarme.service';

describe('PagarmeService.createRecipient', () => {
  const svc = new PagarmeService({ get: () => undefined } as never);
  const sent: { method: string; path: string; body: Record<string, any> }[] = [];
  (svc as any).request = async (method: string, path: string, body: Record<string, any>) => {
    sent.push({ method, path, body });
    return { id: 're_new', status: 'registration' };
  };

  const seller = {
    name: 'Maria da Silva',
    cpf: '123.456.789-09',
    email: 'maria@example.com',
    birthDate: '1990-02-10',
    phoneE164: '+5521994647568',
    monthlyIncome: 3500,
    occupation: 'Professora',
    address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Rio de Janeiro', state: 'RJ', zipCode: '20021-130' },
    bankCode: '341', bankAgency: '1234', bankAccount: '56789', bankAccountDigit: '0',
  };

  it('sends the register_information format Pagar.me requires', async () => {
    await svc.createRecipient(seller);
    const { method, path, body } = sent[sent.length - 1];
    expect([method, path]).toEqual(['POST', '/recipients']);
    expect(body.name).toBeUndefined(); // the old top-level contract is gone
    const reg = body.register_information;
    expect(reg).toMatchObject({
      type: 'individual',
      document: '12345678909',
      birthdate: '10/02/1990',
      monthly_income: 3500,
      professional_occupation: 'Professora',
      site_url: 'https://www.arenadosmantos.app.br',
      phone_numbers: [{ ddd: '21', number: '994647568', type: 'mobile' }],
    });
    expect(reg.address).toMatchObject({ zip_code: '20021130', street_number: '10', state: 'RJ' });
    expect(body.default_bank_account.holder_document).toBe('12345678909');
  });

  it('never sends an empty complement or reference point', async () => {
    await svc.createRecipient({ ...seller, address: { ...seller.address, complement: '  ' } });
    const { address } = sent[sent.length - 1].body.register_information;
    expect(address.complementary).toBe('Não informado');
    expect(address.reference_point).toBe('Não informado');
  });
});
