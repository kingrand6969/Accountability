export type TxKind = 'income' | 'expense';

export type Transaction = {
  id: string;
  kind: TxKind;
  amount: number;
  category: string;
  note: string | null;
  tx_date: string; // YYYY-MM-DD
  created_at?: string;
};

export type NewTransaction = {
  kind: TxKind;
  amount: number;
  category: string;
  note?: string | null;
  tx_date: string;
};
