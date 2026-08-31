export type LoanStatus = 'Pendente' | 'Pago' | 'Cancelado';
export type ContractType = 'normal' | 'installment';

export type Loan = {
  id: string;
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
  status: LoanStatus;
  contract_type: ContractType;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  nome: string;
  plano: string;
  status_assinatura: string;
  teste_ate: string;
  is_admin: boolean;
};

export type Pagamento = {
  id: string | number;
  user_id: string;
  emprestimo_id: string | null;
  tipo: 'Juros' | 'Total' | 'Parcial' | string;
  valor: number;
  pago_em: string;
  observacao: string | null;
};

export type { Installment, InstallmentStatus, InstallmentContract, ContractFilters } from './installment';