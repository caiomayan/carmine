/**
 * A identificação do fornecedor no recibo (nome, CPF e endereço de quem vende o VIP). Não vem da API: o
 * dono vai fornecer, e fica em variáveis do web (`RECEIPT_SUPPLIER_NAME`, `RECEIPT_SUPPLIER_DOCUMENT`,
 * `RECEIPT_SUPPLIER_ADDRESS`), lidas a cada requisição. Enquanto faltar qualquer uma, o recibo mostra um
 * bloco "a informar", nunca um dado inventado.
 */
export type ReceiptSupplier =
  | { configured: true; name: string; document: string; address: string }
  | { configured: false };

export function receiptSupplier(
  env: Record<string, string | undefined> = process.env,
): ReceiptSupplier {
  const name = env.RECEIPT_SUPPLIER_NAME?.trim();
  const document = env.RECEIPT_SUPPLIER_DOCUMENT?.trim();
  const address = env.RECEIPT_SUPPLIER_ADDRESS?.trim();
  return name && document && address
    ? { configured: true, name, document, address }
    : { configured: false };
}
