# Future Plan: Headless System Agent para Primeira Mensagem Automática

Ideia levantada em 2026-07-03 durante o teste real do onboarding-agent, ainda sem plano formal — este documento só registra o conceito e as dúvidas em aberto para quando o modo de plano for aberto sobre o tema.

## 1. Problema

Hoje, quando um `.agent` é carregado num chat vazio (o onboarding-agent é o primeiro caso real), o `goal`/`guide` do state de entrada ficam disponíveis no `flowState`, mas ninguém dispara a chamada de LLM sozinho — o usuário precisa mandar a primeira mensagem para o assistente reagir. Isso quebra a experiência de "onboarding automático": o chat aparece, o painel abre, mas o usuário ainda vê um chat vazio esperando ele digitar algo.

## 2. Ideia proposta

- `murici/agents/memory-agent` deixa de ser só um agente coadjuvante e vira um **system-agent**: uma instância headless (sem UI própria, sem chat visível) que fica rodando/disponível para ser consultada.
- Novo state `new_chat_agent` em `murici/agents/memory-agent/main.behavior`, com `goal`/`guide` descrevendo como o sistema deve se comportar/o que dizer quando um `.agent` acabou de ser carregado num chat vazio.
- Fluxo: ao carregar um `.agent` num chat vazio, mudamos o state do memory-agent (headless) para `new_chat_agent`, capturamos o `goal`/`guide` que ele emite, e embutimos esse texto num prompt inicial junto com o `goal`/`guide` do `.agent` que está sendo carregado (onboarding, no caso) — gerando a primeira mensagem do assistente sem o usuário precisar interagir.
- Objetivo é generalizar: não é uma solução só para o onboarding-agent, é para **qualquer** `.agent` carregado num chat vazio — onboarding é só o primeiro consumidor real.

## 3. Bloqueio identificado durante teste (2026-07-03)

No primeiro uso real (ambiente limpo), **não existe modelo configurado ainda** — o usuário ainda não passou pela tela de settings que define o modelo de tarefas automáticas. Isso é uma dependência circular real: o próprio onboarding existe pra ensinar o usuário a configurar o modelo, mas a ideia de "LLM gera a primeira mensagem sozinho" precisa de um modelo já configurado para funcionar. Precisa ser resolvido no plano — não é só um detalhe de implementação.

## 4. Dúvidas em aberto (ainda sem resposta)

1. **Escopo do gatilho**: "replicar para todos os carregamentos de `.agent` em chat vazio" é literal — inclusive quando o usuário carrega um `.agent` manualmente (drag-and-drop / "abrir com")? Ou só os carregamentos que o próprio murici dispara automaticamente (hoje, só o onboarding)?
2. **O que "system-agent" muda na prática**: é só uma renomeação semântica do memory-agent, ou implica um modo de execução novo — uma sessão headless persistente e compartilhada, diferente de como o memory-agent roda hoje (que parece ser per-chat)? Precisa entender o uso atual do memory-agent antes de decidir.
3. **Composição do prompt inicial**: o texto de `new_chat_agent` (memory-agent) e o `goal`/`guide` do `.agent` alvo (onboarding) se combinam numa única chamada de LLM que já gera a mensagem final visível? Ou o memory-agent roda primeiro e o resultado vira memória/contexto injetado antes do `.agent` alvo rodar seu próprio `goal`/`guide` normalmente (duas etapas)?
4. **Fallback sem modelo configurado**: se não houver modelo (bloqueio da seção 3), o chat abre vazio mesmo (sem mensagem automática, usuário digita normalmente) ou existe um texto estático de fallback pré-escrito?
5. **Falha do headless em geral**: mesmo com modelo configurado, se a chamada headless falhar (timeout, erro de parse, etc.), qual o comportamento — silencioso (chat abre vazio) ou algum aviso?

## 5. Próximos passos

Retomar como plano formal (modo de plano) depois que o onboarding-agent estiver validado ponta a ponta no fluxo atual (sem mensagem automática). Resolver a dúvida 3 (bloqueio de modelo) é pré-requisito antes de desenhar a arquitetura do system-agent.
