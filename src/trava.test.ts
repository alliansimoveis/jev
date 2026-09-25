import { describe, expect, it } from "vitest";
import { aplicarTrava, discordancia, vaiParaNaoPerturbar } from "./trava";
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
  it("'no momento não, obrigada': a Bia só para, sem chamar a equipe (casos reais #441, #449, #466)", () => {
    const r = aplicarTrava("encerrar_sem_interesse", leitura({ recusa: 0.4, recusaDefinitiva: 0.05, intencao: "adiou" }));
    expect(r.acao).toBe("encerrar_sem_interesse");
    expect(r.trava).toBe("adiou_so_pausa");
    expect(vaiParaNaoPerturbar(leitura({ recusa: 0.4, recusaDefinitiva: 0.05, intencao: "adiou" }))).toBe(false);
  });
  it("encerrar sem recusa e sem adiamento continua indo para a equipe (caso real #534)", () => {
    expect(aplicarTrava("encerrar_sem_interesse", leitura({ recusa: 0.08, recusaDefinitiva: 0.32, intencao: "responde" })).trava).toBe("encerrar_para_equipe");
  });
  it("cadastro em 45% continua barrado: o usuário avaliou o caso #474 e o TypeSafe acertou", () => {
    expect(aplicarTrava("dados_confirmados", leitura({ biaMostrouCadastro: 0.45, confirmouCadastro: 0.98 })).trava).toBe("confirmacao_para_equipe");
    // O "Sim" solto do cartão #558, que o usuário também deu ao TypeSafe.
    expect(aplicarTrava("dados_confirmados", leitura({ biaMostrouCadastro: 0.07, confirmouCadastro: 0.91 })).trava).toBe("confirmacao_para_equipe");
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
  it("pediu uma pessoa e o Claude seguiu o roteiro: vai para a equipe (caso real #404, botão 'Falar com a equipe')", () => {
    for (const a of ["responder", "aguardar"] as const) {
      const r = aplicarTrava(a, leitura({ querHumano: 0.93 }));
      expect(r.acao).toBe("passar_para_humano");
      expect(r.trava).toBe("pedido_de_pessoa");
    }
    expect(aplicarTrava("responder", leitura({ querHumano: 0.6 })).acao).toBe("responder");
  });
  it("ligação agendada, cadastro confirmado e transferência não são atropelados pelo pedido de pessoa", () => {
    for (const a of ["passar_para_humano", "ligacao_agendada", "transferir_para_closer"] as const) {
      expect(aplicarTrava(a, leitura({ recusa: 0.99, querHumano: 0.99 })).acao).toBe(a);
    }
    expect(aplicarTrava("dados_confirmados", leitura({ querHumano: 0.99, biaMostrouCadastro: 0.9, confirmouCadastro: 0.9 })).acao).toBe("dados_confirmados");
  });
});

describe("vaiParaNaoPerturbar", () => {
  it("recusa para sempre ou número errado: não perturbar", () => {
    expect(vaiParaNaoPerturbar(leitura({ recusa: 0.99, recusaDefinitiva: 0.95 }))).toBe(true);
    expect(vaiParaNaoPerturbar(leitura({ recusa: 0.3, recusaDefinitiva: 0.1, numeroErrado: 0.9 }))).toBe(true);
  });
  it("'não tenho interesse no momento': só pausa (caso real #362)", () => {
    expect(vaiParaNaoPerturbar(leitura({ recusa: 0.86, recusaDefinitiva: 0.2 }))).toBe(false);
  });
  it("sem leitura, ou leitura antiga sem a pergunta nova, fica como antes", () => {
    expect(vaiParaNaoPerturbar(null)).toBe(true);
    expect(vaiParaNaoPerturbar(leitura({ recusa: 0.9 }))).toBe(true);
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
    expect(discordancia("responder", leitura({ querHumano: 0.95 }), "pedido_de_pessoa")).toMatch(/seguiu o roteiro/);
  });
  it("a confirmação de cadastro da abertura não é mais alarme (20 falsos em 21-22/09)", () => {
    expect(discordancia("responder", leitura({ biaMostrouCadastro: 0.95, confirmouCadastro: 0.95 }), null)).toBeNull();
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

describe("trava das ações da Bia Fecha Contrato", () => {
  it("criar_assinatura sem o sim do cliente vai para a equipe", () => {
    const t = aplicarTrava("criar_assinatura", leitura({ confirmouResumo: 0.2 }));
    expect(t.acao).toBe("passar_para_humano");
    expect(t.trava).toBe("fechamento_para_equipe");
    expect(discordancia("criar_assinatura", leitura({ confirmouResumo: 0.2 }), t.trava)).toContain("assinatura");
  });
  it("com o sim, criar_pedido passa", () => {
    expect(aplicarTrava("criar_pedido", leitura({ confirmouResumo: 0.9 })).trava).toBeNull();
  });
  it("leitura antiga, sem a pergunta nova, usa a confirmação do cadastro", () => {
    expect(aplicarTrava("criar_assinatura", leitura({ confirmouCadastro: 0.9 })).trava).toBeNull();
  });
  it("sem leitura, nada trava", () => {
    expect(aplicarTrava("criar_assinatura", null).trava).toBeNull();
  });
});
