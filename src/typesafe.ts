/**
 * Segunda opinião do TypeSafe (modelo Jev) sobre cada turno da Bia (21/09/2026).
 *
 * O Claude escreve a resposta e escolhe a ação. O Jev não escreve nada: lê a
 * conversa e devolve probabilidades para perguntas fechadas ("a pessoa
 * recusou?", "confirmou o cadastro?"). O código usa essa leitura para travar
 * as duas ações que não têm volta (ver trava.ts) e grava tudo no turno, para a
 * tela "Bia × TypeSafe" mostrar onde os dois discordam.
 *
 * O Jev não aprende com as conversas: melhora quando as perguntas daqui
 * melhoram. Ele lê ao pé da letra; no teste de 21/09 a pergunta "confirmou o
 * cadastro?" disparava no botão "Sim, sou eu" do disparo, por isso ela agora
 * vem acompanhada de "a Bia mostrou o cadastro?", e a trava exige as duas.
 *
 * Falhar aqui nunca para a Bia: sem chave, fora do ar ou lento, a leitura é
 * null e o turno segue como antes.
 */
/** Uma mensagem da conversa, como o CRM guarda. */
export type MensagemDaConversa = { direcao: "inbound" | "outbound"; tipo: string; texto: string | null; em: number };

export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const TYPESAFE_MODELO = "jev-latest";
const TEMPO_MAXIMO_MS = 8_000;

export function typesafeConfigurado(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

/** As perguntas de cada turno. As chaves são nossas; o modelo só lê o texto. */
export const PERGUNTAS = {
  recusa: {
    type: "noul",
    instructions: "In `ultima_fala_do_cliente` (Brazilian Portuguese WhatsApp), does the customer clearly refuse: say they are not interested, ask to stop receiving messages, or ask to be removed? Use `conversa` only as context.",
    criteria: {
      true: "Clear refusal or opt-out, e.g. 'não tenho interesse', 'pare de mandar', 'me tira da lista', 'não quero'.",
      false: "Anything else: questions, doubts, price objections, postponing ('vou pensar', 'agora não posso', 'mais adiante a gente vê', 'quando precisar procuro'), thanks, greetings, or interest.",
    },
  },
  // "Não tenho interesse no momento" é recusa, mas não para sempre: só pausa a
  // Bia e o contato segue livre para um disparo futuro (decisão de 22/09/2026).
  recusa_definitiva: {
    type: "noul",
    instructions: "In `ultima_fala_do_cliente`, does the customer refuse for good, with no time limit, rather than only for now?",
    criteria: {
      true: "Permanent refusal: 'não tenho interesse', 'não quero', 'pare de mandar', 'me tira da lista', 'nunca'.",
      false: "Refusal limited in time or no refusal: 'não tenho interesse no momento', 'agora não', 'por enquanto não', 'quem sabe mais pra frente'.",
    },
  },
  numero_errado: {
    type: "noul",
    instructions: "In `ultima_fala_do_cliente`, does the person say this phone number does not belong to the person Bia is looking for, or that they do not know that person?",
    criteria: { true: "Wrong number: 'esse telefone não é da Maria', 'não conheço', 'número errado'.", false: "The person does not say it is a wrong number." },
  },
  quer_humano: {
    type: "noul",
    instructions: "In `ultima_fala_do_cliente`, does the customer ask to talk to a human person or an attendant, or say they want a real person instead of a bot?",
    criteria: { true: "Explicitly asks for a person, atendente, humano, or complains that it is a robot.", false: "Does not ask for a human." },
  },
  bia_mostrou_cadastro: {
    type: "noul",
    instructions: "Does `ultima_mensagem_da_bia` show the customer's registration data (such as full name, CPF ending, address, birth date or dependents) and ask the customer to confirm it is correct?",
    criteria: {
      true: "Lists the customer's own data and asks if it is correct.",
      false: "Anything else, including only asking 'é você?' / 'falo com Fulana?' or presenting prices.",
    },
  },
  confirmou_cadastro: {
    type: "noul",
    instructions: "In `ultima_fala_do_cliente`, does the customer say that the registration data shown in `ultima_mensagem_da_bia` is correct?",
    criteria: {
      true: "Confirms: 'sim', 'isso', 'correto', 'tá certo', 'confirmo'.",
      false: "Does not confirm, corrects some data, asks a question, or only confirms their identity ('sou eu').",
    },
  },
  aceitou_ligacao: {
    type: "noul",
    instructions: "Did Bia offer a phone call in `conversa`, and in `ultima_fala_do_cliente` does the customer accept receiving the call or give a time for it?",
    criteria: { true: "Accepts the call or gives a time for it.", false: "No call was offered, or the customer declines or ignores it." },
  },
  intencao: {
    type: "choice",
    instructions: "What is the customer mainly doing in `ultima_fala_do_cliente`, given `conversa`?",
    criteria: {
      quer_assinar: "Wants to subscribe or close now, asks how to pay or sign up.",
      pergunta: "Asks a question about the plan, prices, doctors, exams, coverage or how it works.",
      objecao: "Raises an objection: too expensive, already has a plan, needs to think, no money now.",
      adiou: "Postpones without refusing: later, when needed, not now.",
      sem_interesse: "Not interested, asks to stop messages.",
      numero_errado: "Says it is the wrong person or wrong number.",
      pede_humano: "Wants to talk to a person.",
      responde: "Answers Bia's question or confirms identity, data or a time, with no new question.",
      outro: "Greeting, thanks, emoji, audio, off-topic or unclear.",
    },
  },
} as const;

export type Leitura = {
  recusa: number;
  /** Ausente nas leituras de antes de 22/09/2026. */
  recusaDefinitiva?: number;
  numeroErrado: number;
  querHumano: number;
  biaMostrouCadastro: number;
  confirmouCadastro: number;
  aceitouLigacao: number;
  intencao: string;
  intencaoConfianca: number;
  modelo: string;
  tokens: number;
  ms: number;
};

/**
 * Tira do texto o que não precisa sair do CRM: e-mail, CPF, CEP, telefone,
 * números longos e os sobrenomes do cartão (fica o primeiro nome).
 */
export function anonimizar(texto: string | null | undefined, nomeDoCartao?: string | null): string {
  let t = String(texto ?? "");
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
  t = t.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]");
  t = t.replace(/\b\d{5}-\d{3}\b/g, "[cep]");
  t = t.replace(/(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]");
  t = t.replace(/\b\d{8,}\b/g, "[numero]");
  const partes = String(nomeDoCartao ?? "").trim().split(/\s+/).filter((p) => p.length > 2);
  for (const p of partes.slice(1)) {
    t = t.replace(new RegExp(`(?<![\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu"), "");
  }
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?])/g, "$1").trim();
}

/** O que o Jev lê: a conversa desde o disparo, a última fala do cliente e a última mensagem da Bia antes dela. */
export function estadoParaTypeSafe(conversa: MensagemDaConversa[], nomeDoCartao?: string | null) {
  const janela = conversa.slice(-14);
  let i = janela.length - 1;
  const fala: string[] = [];
  for (; i >= 0 && janela[i].direcao === "inbound"; i--) fala.unshift(anonimizar(janela[i].texto ?? `[${janela[i].tipo}]`, nomeDoCartao));
  const bia = i >= 0 ? anonimizar(janela[i].texto ?? "", nomeDoCartao) : "";
  return {
    conversa: janela.map((m) => ({
      quem: m.direcao === "inbound" ? "cliente" : "Bia",
      texto: anonimizar(m.texto ?? `[${m.tipo}]`, nomeDoCartao).slice(0, 600),
    })),
    ultima_mensagem_da_bia: bia.slice(0, 1200),
    ultima_fala_do_cliente: fala.join("\n").slice(0, 1200),
  };
}

const r2 = (x: unknown) => Math.round(Number(x ?? 0) * 100) / 100;

/** Pergunta ao Jev. Devolve null em qualquer falha: a Bia não depende disto. */
export async function lerComTypeSafe(conversa: MensagemDaConversa[], nomeDoCartao?: string | null): Promise<Leitura | null> {
  if (!typesafeConfigurado()) return null;
  const estado = estadoParaTypeSafe(conversa, nomeDoCartao);
  if (!estado.ultima_fala_do_cliente) return null;
  const inicio = Date.now();
  try {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const r = await fetch(TYPESAFE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY!.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: TYPESAFE_MODELO, state: estado, questions: PERGUNTAS }),
        signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
      });
      if ((r.status === 429 || r.status === 529) && tentativa === 0) { await new Promise((ok) => setTimeout(ok, 1_000)); continue; }
      if (!r.ok) {
        console.warn(`[TypeSafe] HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
        return null;
      }
      const j: any = await r.json();
      const a = j.answers ?? {};
      return {
        recusa: r2(a.recusa?.noul),
        recusaDefinitiva: r2(a.recusa_definitiva?.noul),
        numeroErrado: r2(a.numero_errado?.noul),
        querHumano: r2(a.quer_humano?.noul),
        biaMostrouCadastro: r2(a.bia_mostrou_cadastro?.noul),
        confirmouCadastro: r2(a.confirmou_cadastro?.noul),
        aceitouLigacao: r2(a.aceitou_ligacao?.noul),
        intencao: String(a.intencao?.choice ?? "outro"),
        intencaoConfianca: r2(a.intencao?.confidence),
        modelo: String(j.model ?? TYPESAFE_MODELO),
        tokens: Number(j.usage?.input_tokens ?? 0),
        ms: Date.now() - inicio,
      };
    }
    return null;
  } catch (e: any) {
    console.warn("[TypeSafe]", e?.name === "TimeoutError" ? "demorou mais de 8 s" : e?.message ?? e);
    return null;
  }
}
