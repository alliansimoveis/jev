/** As ações que a Bia (agente de IA) pode tomar em um turno. */
export const ACOES = ["responder", "dados_confirmados", "ligacao_agendada", "transferir_para_closer", "passar_para_humano", "encerrar_sem_interesse", "aguardar"] as const;
export type AcaoDoAgente = (typeof ACOES)[number];
