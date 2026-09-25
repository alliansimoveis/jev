/**
 * O que o código faz com a leitura do TypeSafe (21/09/2026). Regras puras, sem
 * banco nem rede, para os testes.
 *
 * Trava: só nas quatro ações que não têm volta. Encerrar sem interesse põe o
 * número no "não perturbar"; dados confirmados chama a closer para fechar;
 * criar assinatura e criar pedido (Bia Fecha Contrato) exigem o resumo com o
 * sim do cliente. Se o Jev não enxerga o mesmo que o Claude, a conversa vai
 * para a equipe em vez de o sistema agir sozinho. Sem leitura (TypeSafe
 * fora), nada muda.
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
/**
 * Em 24/09/2026 baixei este limite para 30%, achando que a trava tinha barrado
 * um fechamento bom no cartão #474 (a Bia listou os dados sem terminar com
 * "está certo?", a pergunta ficou em 45% e a cliente respondeu "Está correto").
 * Na avaliação da tela, o usuário marcou que ali o TypeSafe ACERTOU ao barrar:
 * os dados listados tinham o telefone errado. Voltou para 50%.
 */
export const LIMITE_MOSTROU_CADASTRO = LIMITE_DA_TRAVA;

export type Trava = "encerrar_para_equipe" | "confirmacao_para_equipe" | "pedido_de_pessoa" | "adiou_so_pausa" | "fechamento_para_equipe";

export function aplicarTrava(acao: AcaoDoAgente, leitura: Leitura | null): { acao: AcaoDoAgente; trava: Trava | null; motivo: string | null } {
  if (!leitura) return { acao, trava: null, motivo: null };
  if (acao === "encerrar_sem_interesse" && Math.max(leitura.recusa, leitura.numeroErrado) < LIMITE_DA_TRAVA) {
    // "No momento não, obrigada" é adiamento: a Bia se despede e para por aqui.
    // Não é recusa para o não perturbar nem caso para chamar a equipe (24/09/2026).
    if (leitura.intencao === "adiou") {
      return { acao, trava: "adiou_so_pausa", motivo: "a pessoa adiou, não recusou: a Bia se despede e o cartão vai para venda perdida, sem não perturbar e sem chamar a equipe" };
    }
    return {
      acao: "passar_para_humano", trava: "encerrar_para_equipe",
      motivo: `TypeSafe não viu recusa (recusa ${pct(leitura.recusa)}, número errado ${pct(leitura.numeroErrado)}): em vez do não perturbar, a equipe decide`,
    };
  }
  if (acao === "dados_confirmados" && (leitura.confirmouCadastro < LIMITE_DA_TRAVA || leitura.biaMostrouCadastro < LIMITE_MOSTROU_CADASTRO)) {
    return {
      acao: "passar_para_humano", trava: "confirmacao_para_equipe",
      motivo: `TypeSafe não viu confirmação do cadastro (Bia mostrou ${pct(leitura.biaMostrouCadastro)}, cliente confirmou ${pct(leitura.confirmouCadastro)}): a equipe confere antes de fechar`,
    };
  }
  // Bia Fecha Contrato: criar a assinatura e registrar o pedido não têm volta.
  // Duas perguntas, como dados_confirmados: a Bia pediu licença para gerar E o
  // cliente disse sim (o Jev lê ao pé da letra; uma pergunta só, combinando as
  // duas, disparava em "Pode ser no cartão?" → "sim").
  if (acao === "criar_assinatura" || acao === "criar_pedido") {
    // Leitura sem as perguntas novas vale 0: sem o sim visto, a equipe conclui (é o lado seguro).
    const pediu = leitura.biaPediuParaGerar ?? 0;
    const sim = leitura.confirmouResumo ?? 0;
    if (pediu < LIMITE_DA_TRAVA || sim < LIMITE_DA_TRAVA) {
      return {
        acao: "passar_para_humano", trava: "fechamento_para_equipe",
        motivo: `TypeSafe não viu o resumo com o sim do cliente (Bia pediu para gerar ${pct(pediu)}, cliente disse sim ${pct(sim)}): a equipe conclui ${acao === "criar_assinatura" ? "a assinatura" : "o pedido"}`,
      };
    }
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
  if (leitura.intencao === "adiou") return false;
  return leitura.recusaDefinitiva >= LIMITE_DA_TRAVA || leitura.numeroErrado >= LIMITE_DA_TRAVA;
}

/** Onde os dois discordam, em uma frase para a tela. null quando concordam. */
export function discordancia(acaoDoClaude: AcaoDoAgente | string, leitura: Leitura | null, trava: Trava | null): string | null {
  if (!leitura) return null;
  if (trava === "encerrar_para_equipe") return "Claude encerrou, TypeSafe não viu recusa";
  if (trava === "confirmacao_para_equipe") return "Claude deu cadastro confirmado, TypeSafe não viu confirmação";
  if (trava === "pedido_de_pessoa") return "Cliente pediu uma pessoa, Claude seguiu o roteiro";
  if (trava === "adiou_so_pausa") return "Claude encerrou, TypeSafe viu adiamento: cartão em venda perdida, sem bloquear o número";
  if (trava === "fechamento_para_equipe") return acaoDoClaude === "criar_assinatura" ? "Claude ia criar a assinatura, TypeSafe não viu o resumo com o sim" : "Claude ia registrar o pedido, TypeSafe não viu o resumo com o sim";
  const seguiu = acaoDoClaude === "responder" || acaoDoClaude === "aguardar";
  if (seguiu && leitura.recusa >= LIMITE_DE_ALERTA) return "TypeSafe viu recusa, Claude seguiu a conversa";
  if (seguiu && leitura.numeroErrado >= LIMITE_DE_ALERTA) return "TypeSafe viu número errado, Claude seguiu a conversa";
  if (acaoDoClaude !== "passar_para_humano" && leitura.querHumano >= LIMITE_DE_ALERTA) return "Cliente pediu uma pessoa, Claude não passou para a equipe";
  if (acaoDoClaude === "ligacao_agendada" && leitura.aceitouLigacao < LIMITE_DA_TRAVA) return "Claude agendou ligação, TypeSafe não viu aceite";
  return null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
