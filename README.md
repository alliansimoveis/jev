# Jev na Bia

Segunda opinião do [TypeSafe](https://typesafe.ai) (modelo **Jev**) sobre as decisões da Bia, a agente de IA que atende no WhatsApp as pessoas que respondem aos disparos da SIMED SAÚDE.

A Bia usa o Claude para escrever a resposta e escolher a ação do turno: continuar a conversa, passar para a equipe, agendar ligação, dar o cadastro como confirmado ou encerrar sem interesse. O Jev não escreve texto. Ele lê a mesma conversa e responde perguntas fechadas, com a probabilidade junto:

| Pergunta | Tipo |
|---|---|
| A pessoa recusou claramente (não quer, pediu para parar)? | sim/não |
| A recusa é para sempre, ou só "no momento"? | sim/não |
| Disse que o número é de outra pessoa? | sim/não |
| Pediu para falar com uma pessoa? | sim/não |
| A última mensagem da Bia mostrou o cadastro e pediu confirmação? | sim/não |
| A pessoa confirmou que o cadastro está certo? | sim/não |
| Aceitou receber a ligação? | sim/não |
| O que ela está fazendo: quer assinar, pergunta, objeção, adiou, sem interesse... | escolha |

## A trava

Duas ações da Bia não têm volta:

- **Encerrar sem interesse** coloca o número no "não perturbar".
- **Dados confirmados** chama a closer para fechar a venda.

Elas só acontecem se o Jev enxergar o mesmo que o Claude. Se não enxergar, a conversa vai para a equipe decidir.

Desde 22/09/2026 há mais duas regras:

- **Pedido de pessoa.** Se a pessoa pede alguém da equipe (por exemplo, o botão "Falar com a equipe") e o Claude segue o roteiro, sai só um aviso curto e a conversa vai para a closer. Ligação agendada e cadastro confirmado não são afetados.
- **"Não tenho interesse no momento" só pausa a Bia.** O número vai para o "não perturbar" só quando a recusa é para sempre ou quando é de outra pessoa.

As outras ações seguem como o Claude decidiu, e a leitura do Jev fica registrada para comparação.

Se o TypeSafe estiver fora do ar, sem chave ou demorar mais de 8 segundos, a leitura é `null` e a Bia segue exatamente como antes.

## Por que existe

No teste de 21/09/2026, sobre 70 turnos reais da Bia:

- o Claude mandou para o "não perturbar" uma cliente que tinha dito *"mais adiante vemos para nós"*. Isso é adiar, não recusar. O Jev deu 3% de chance de ser recusa;
- o Jev leu bem o português do WhatsApp: "vou pensar" e "agora não posso" não viraram recusa, e corrigir o endereço não virou confirmação;
- na segunda varredura (161 turnos, 21 e 22/09), os dois concordaram nos encerramentos, na ligação agendada e nos 6 adiamentos. O Jev pegou uma pessoa que tocou em "Falar com a equipe" enquanto a Bia seguia o roteiro, o que virou a regra de pedido de pessoa;
- o teste também mostrou que o Jev lê ao pé da letra. A pergunta "confirmou o cadastro?" disparava quando a pessoa só tocava no botão **"Sim, sou eu"** do disparo. Por isso a trava agora exige duas respostas: a Bia mostrou o cadastro **e** a pessoa confirmou.

Custo: cerca de 1.300 tokens de entrada por turno, perto de R$ 0,0003. Cada leitura leva em torno de 1 segundo e roda em paralelo com o Claude.

O Jev não aprende com as conversas. Ele melhora quando as perguntas melhoram. No CRM, a tela "Bia × TypeSafe" lista as discordâncias para a equipe marcar quem acertou, e essas marcações são a régua para ajustar as perguntas.

## Arquivos

- `src/typesafe.ts`: as perguntas, a anonimização (CPF, telefone, e-mail, CEP e sobrenomes saem antes do envio) e a chamada à API.
- `src/trava.ts`: as regras da trava e das discordâncias, sem rede nem banco.
- `src/trava.test.ts`: os testes, incluindo os casos reais do teste de 21/09.
- `exemplos/testar.mts`: quatro conversas inventadas contra a API de verdade.

## Rodar

```bash
npm install
npm test
TYPESAFE_API_KEY=sua_chave npm run exemplo
```

A chave fica só no servidor (variável `TYPESAFE_API_KEY`), nunca no navegador.
