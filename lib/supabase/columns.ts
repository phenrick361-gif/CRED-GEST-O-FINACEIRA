export const LOAN_COLUMNS = 'id,user_id,cliente,telefone,observacao,descricao,valor_emprestado,porcentagem_juros,juros_aplicado,modalidade,periodicidade,prazo_meses,data_emprestimo,data_vencimento,status';

export const LOAN_COLUMNS_ARRAY = LOAN_COLUMNS.split(',');

export const PAGAMENTO_COLUMNS = 'id,user_id,emprestimo_id,tipo,valor,pago_em,observacao';

export const PAGAMENTO_COLUMNS_ARRAY = PAGAMENTO_COLUMNS.split(',');