import { describe, expect, it } from 'vitest';
import { receiptSupplier } from './receipt-supplier';

describe('receiptSupplier', () => {
  it('sem as variáveis, o fornecedor está por informar', () => {
    expect(receiptSupplier({})).toEqual({ configured: false });
  });

  it('com as três, vale o que o dono informou, sem espaços nas pontas', () => {
    expect(
      receiptSupplier({
        RECEIPT_SUPPLIER_NAME: ' Fulano de Tal ',
        RECEIPT_SUPPLIER_DOCUMENT: '123.456.789-09',
        RECEIPT_SUPPLIER_ADDRESS: 'Rua das Flores, 10, São Paulo',
      }),
    ).toEqual({
      configured: true,
      name: 'Fulano de Tal',
      document: '123.456.789-09',
      address: 'Rua das Flores, 10, São Paulo',
    });
  });

  it('com uma só faltando (ou em branco), continua por informar: nunca um recibo pela metade', () => {
    expect(
      receiptSupplier({
        RECEIPT_SUPPLIER_NAME: 'Fulano',
        RECEIPT_SUPPLIER_DOCUMENT: '  ',
        RECEIPT_SUPPLIER_ADDRESS: 'Rua A',
      }),
    ).toEqual({ configured: false });
  });
});
