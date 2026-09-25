/**
 * As ações que a Bia (agente de IA) pode tomar em um turno. criar_assinatura,
 * criar_pedido e finalizar são só da Bia Fecha Contrato (25/09/2026); nos
 * outros papéis o motor as rebaixa a "responder".
 */
export const ACOES = [
  "responder", "dados_confirmados", "ligacao_agendada", "transferir_para_closer", "passar_para_humano", "encerrar_sem_interesse", "aguardar",
  "criar_assinatura", "criar_pedido", "finalizar",
] as const;
export type AcaoDoAgente = (typeof ACOES)[number];
