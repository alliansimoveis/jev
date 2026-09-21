import { describe, expect, it } from "vitest";
import { aplicarTrava, discordancia } from "./trava";
import { anonimizar, estadoParaTypeSafe, type Leitura } from "./typesafe";

const leitura = (x: Partial<Leitura> = {}): Leitura => ({
  recusa: 0.02, numeroErrado: 0.02, querHumano: 0.02, biaMostrouCadastro: 0.02, confirmouCadastro: 0.02, aceitouLigacao: 0.02,
  intencao: "responde", intencaoConfianca: 1, modelo: "jev-1.13.0", tokens: 1000, ms: 300, ...x,
});

describe("aplicarTrava", () => {
  it("sem leitura do TypeSafe, nada muda", () => {
    expect(aplicarTrava("encerrar_sem_interesse", null)).toEqual({ acao: "encerrar_sem_interesse", trava: null, motivo: null });
    expect(aplicarTrava("dados_confirmados", null).acao).toBe("dados_confirmados");
  });
  it("encerrar sem recusa vai para a equipe (caso real #104: 'mais adiante vemos para nós')", () => {
    const r = aplicarTrava("encerrar_sem_interesse", leitura({ recusa: 0.03 }));
    expect(r.acao).toBe("passar_para_humano");
    expect(r.trava).toBe("encerrar_para_equipe");
  });
  it("encerrar com recusa clara passa", () => {
    expect(aplicarTrava("encerrar_sem_interesse", leitura({ recusa: 0.99 })).acao).toBe("encerrar_sem_interesse");
  });
  it("número errado também justifica encerrar (caso real #95)", () => {
    expect(aplicarTrava("encerrar_sem_interesse", leitura({ recusa: 0.2, numeroErrado: 0.9 })).acao).toBe("encerrar_sem_interesse");
  });
  it("dados confirmados exige que a Bia tenha mostrado o cadastro E o cliente confirmado", () => {
    expect(aplicarTrava("dados_confirmados", leitura({ biaMostrouCadastro: 0.95, confirmouCadastro: 0.97 })).acao).toBe("dados_confirmados");
    // "🔘 Sim, sou eu" do botão: confirma a pessoa, não o cadastro.
    expect(aplicarTrava("dados_confirmados", leitura({ biaMostrouCadastro: 0.05, confirmouCadastro: 0.92 })).trava).toBe("confirmacao_para_equipe");
    expect(aplicarTrava("dados_confirmados", leitura({ biaMostrouCadastro: 0.95, confirmouCadastro: 0.11 })).acao).toBe("passar_para_humano");
  });
  it("as outras ações nunca são travadas", () => {
    for (const a of ["responder", "aguardar", "passar_para_humano", "ligacao_agendada", "transferir_para_closer"] as const) {
      expect(aplicarTrava(a, leitura({ recusa: 0.99, querHumano: 0.99 })).acao).toBe(a);
    }
  });
});

describe("discordancia", () => {
  it("concordância não aparece na tela", () => {
    expect(discordancia("responder", leitura(), null)).toBeNull();
    expect(discordancia("encerrar_sem_interesse", leitura({ recusa: 0.99 }), null)).toBeNull();
    expect(discordancia("responder", null, null)).toBeNull();
  });
  it("aponta a trava, a recusa ignorada e o pedido de humano", () => {
    expect(discordancia("encerrar_sem_interesse", leitura(), "encerrar_para_equipe")).toMatch(/não viu recusa/);
    expect(discordancia("responder", leitura({ recusa: 0.9 }), null)).toMatch(/viu recusa/);
    expect(discordancia("responder", leitura({ querHumano: 0.95 }), null)).toMatch(/pediu uma pessoa/);
    expect(discordancia("passar_para_humano", leitura({ querHumano: 0.95 }), null)).toBeNull();
    expect(discordancia("ligacao_agendada", leitura({ aceitouLigacao: 0.1 }), null)).toMatch(/não viu aceite/);
  });
});

describe("anonimizar", () => {
  it("tira CPF, telefone, e-mail, CEP e sobrenomes do cartão", () => {
    const t = anonimizar("Sou Maria Aparecida Souza, CPF 123.456.789-09, fone (47) 99123-4567, maria@x.com, CEP 88301-000", "MARIA APARECIDA SOUZA");
    expect(t).not.toMatch(/123\.456|99123|maria@|88301|Aparecida|Souza/);
    expect(t).toMatch(/Maria/);
  });
  it("não mexe em preço", () => {
    expect(anonimizar("sai R$ 59,90 por mês")).toBe("sai R$ 59,90 por mês");
  });
});

describe("estadoParaTypeSafe", () => {
  it("junta as mensagens picadas do fim e separa a última mensagem da Bia", () => {
    const e = estadoParaTypeSafe([
      { direcao: "outbound", tipo: "text", texto: "Confere: Maria, final do CPF 09, Rua X. Tá certo?", em: 1 },
      { direcao: "inbound", tipo: "text", texto: "sim", em: 2 },
      { direcao: "inbound", tipo: "text", texto: "tudo certo", em: 3 },
    ] as any);
    expect(e.ultima_fala_do_cliente).toBe("sim\ntudo certo");
    expect(e.ultima_mensagem_da_bia).toMatch(/Tá certo/);
    expect(e.conversa).toHaveLength(3);
  });
});
