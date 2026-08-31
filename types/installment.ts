export type InstallmentStatus = 'Paga' | 'A vencer' | 'Vence hoje' | 'Atrasada';

export type Installment = {
  id: string;
  contract_id: string | number;
  user_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: InstallmentStatus;
  created_at: string;
  updated_at: string;
};

export type InstallmentContract = {
  id: string | number;
  user_id: string;
  cliente: string;
  telefone: string | null;
  observacao: string | null;
  descricao: string;
  valor_emprestado: number;
  porcentagem_juros: number;
  juros_aplicado: string;
  modalidade: string;
  periodicidade: string;
  prazo_meses: number;
  data_emprestimo: string;
  data_vencimento: string;
  status: string;
  contract_type: 'normal' | 'installment';
  created_at: string;
  updated_at: string;
  installments: Installment[];
  total_paid: number;
  total_amount: number;
  paid_count: number;
  total_count: number;
  next_due_date: string | null;
  next_amount: number;
  progress: number;
};

export type ContractFilters = 'Todos' | 'Em dia' | 'Vence hoje' | 'Atrasados' | 'Quitados';
