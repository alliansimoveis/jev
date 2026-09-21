// Roda 4 conversas inventadas contra a API do TypeSafe e mostra o que a trava faria.
// Uso: TYPESAFE_API_KEY=... npm run exemplo
import { lerComTypeSafe } from "../src/typesafe";
import { aplicarTrava, discordancia } from "../src/trava";
const m = (d: "inbound" | "outbound", texto: string) => ({ direcao: d, tipo: "text", texto, em: 0 });
const casos: [string, any[], any][] = [
  ["#104 adiou", [m("outbound", "Oi Joana, é você?"), m("inbound", "🔘 Sim, sou eu"), m("outbound", "Pra família toda sai 59,90 com telemedicina."), m("inbound", "Já fiz um plano para minha filha, mais adiante vemos para nós"), m("inbound", "Obrigada")], "encerrar_sem_interesse"],
  ["botão sou eu", [m("outbound", "Oi Joana, é você?"), m("inbound", "🔘 Sim, sou eu")], "dados_confirmados"],
  ["confirmou de verdade", [m("outbound", "Confere pra mim: JOANA SILVA, final do CPF 09, Rua das Flores 45, Itajaí, dependente PEDRO. Tá tudo certo?"), m("inbound", "sim, tudo certo")], "dados_confirmados"],
  ["recusa clara", [m("outbound", "Pra família toda sai 59,90."), m("inbound", "não quero, para de me mandar mensagem")], "encerrar_sem_interesse"],
];
for (const [nome, conversa, acao] of casos) {
  const l = await lerComTypeSafe(conversa, "JOANA SILVA");
  const t = aplicarTrava(acao, l);
  console.log(nome.padEnd(22), acao, "→", t.acao, "|", discordancia(acao, l, t.trava) ?? "concordam", "|", l && `rec ${l.recusa} mostrou ${l.biaMostrouCadastro} conf ${l.confirmouCadastro} ${l.intencao} ${l.ms}ms`);
}
