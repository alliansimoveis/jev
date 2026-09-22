/**
 * O que o código faz com a leitura do TypeSafe (21/09/2026). Regras puras, sem
 * banco nem rede, para os testes.
 *
 * Trava: só nas duas ações que não têm volta. Encerrar sem interesse põe o
 * número no "não perturbar"; dados confirmados chama a closer para fechar. Se o
 * Jev não enxerga o mesmo que o Claude, a conversa vai para a equipe em vez de
 * o sistema agir sozinho. Sem leitura (TypeSafe fora), nada muda.
 *
 * Discordância: o que a tela "Bia × TypeSafe" mostra para a equipe marcar
 * quem acertou. Não muda nada na conversa.
 */
import type { AcaoDoAgente } from "./decisao";
import type { Leitura } from "./typesafe";

/** Abaixo disto o Jev "não viu" o que o Claude diz ter visto. */
export const LIMITE_DA_TRAVA = 0.5;
/** A partir disto o Jev viu com clareza algo que o Claude deixou passar. */
export const LIMITE_DE_ALERTA = 0.8;

export type Trava = "encerrar_para_equipe" | "confirmacao_para_equipe" | "pedido_de_pessoa";

export function aplicarTrava(acao: AcaoDoAgente, leitura: Leitura | null): { acao: AcaoDoAgente; trava: Trava | null; motivo: string | null } {
  if (!leitura) return { acao, trava: null, motivo: null };
  if (acao === "encerrar_sem_interesse" && Math.max(leitura.recusa, leitura.numeroErrado) < LIMITE_DA_TRAVA) {
    return {
      acao: "passar_para_humano", trava: "encerrar_para_equipe",
      motivo: `TypeSafe não viu recusa (recusa ${pct(leitura.recusa)}, número errado ${pct(leitura.numeroErrado)}): em vez do não perturbar, a equipe decide`,
    };
  }
  if (acao === "dados_confirmados" && Math.min(leitura.biaMostrouCadastro, leitura.confirmouCadastro) < LIMITE_DA_TRAVA) {
    return {
      acao: "passar_para_humano", trava: "confirmacao_para_equipe",
      motivo: `TypeSafe não viu confirmação do cadastro (Bia mostrou ${pct(leitura.biaMostrouCadastro)}, cliente confirmou ${pct(leitura.confirmouCadastro)}): a equipe confere antes de fechar`,
    };
  }
  // A pessoa pediu uma pessoa (ex.: botão "Falar com a equipe") e o Claude
  // seguiu o roteiro: vai para a equipe (22/09/2026, caso do cartão #404).
  // Só quando ele seguiu a conversa: ligação agendada e cadastro confirmado já chegam a uma pessoa.
  if ((acao === "responder" || acao === "aguardar") && leitura.querHumano >= LIMITE_DE_ALERTA) {
    return {
      acao: "passar_para_humano", trava: "pedido_de_pessoa",
      motivo: `a pessoa pediu para falar com alguém da equipe (TypeSafe ${pct(leitura.querHumano)})`,
    };
  }
  return { acao, trava: null, motivo: null };
}

/**
 * Encerrar sem interesse põe o número no "não perturbar" só quando a recusa é
 * para sempre ou o número é de outra pessoa. "Não tenho interesse no momento"
 * só pausa a Bia (decisão de 22/09/2026). Sem leitura do TypeSafe, vale o de
 * antes: não perturbar.
 */
export function vaiParaNaoPerturbar(leitura: Leitura | null): boolean {
  if (!leitura || leitura.recusaDefinitiva == null) return true;
  return leitura.recusaDefinitiva >= LIMITE_DA_TRAVA || leitura.numeroErrado >= LIMITE_DA_TRAVA;
}

/** Onde os dois discordam, em uma frase para a tela. null quando concordam. */
export function discordancia(acaoDoClaude: AcaoDoAgente | string, leitura: Leitura | null, trava: Trava | null): string | null {
  if (!leitura) return null;
  if (trava === "encerrar_para_equipe") return "Claude encerrou, TypeSafe não viu recusa";
  if (trava === "confirmacao_para_equipe") return "Claude deu cadastro confirmado, TypeSafe não viu confirmação";
  if (trava === "pedido_de_pessoa") return "Cliente pediu uma pessoa, Claude seguiu o roteiro";
  const seguiu = acaoDoClaude === "responder" || acaoDoClaude === "aguardar";
  if (seguiu && leitura.recusa >= LIMITE_DE_ALERTA) return "TypeSafe viu recusa, Claude seguiu a conversa";
  if (seguiu && leitura.numeroErrado >= LIMITE_DE_ALERTA) return "TypeSafe viu número errado, Claude seguiu a conversa";
  if (acaoDoClaude !== "passar_para_humano" && leitura.querHumano >= LIMITE_DE_ALERTA) return "Cliente pediu uma pessoa, Claude não passou para a equipe";
  if (acaoDoClaude === "ligacao_agendada" && leitura.aceitouLigacao < LIMITE_DA_TRAVA) return "Claude agendou ligação, TypeSafe não viu aceite";
  return null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
