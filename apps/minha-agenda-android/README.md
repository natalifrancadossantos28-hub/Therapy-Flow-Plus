# Minha Agenda Android — versão 0.2 com a interface original e voz

A abertura agora usa **a própria interface da agenda oficial**, com calendário,
cores, botões, formulário, confirmação e interpretação de frases do site. O botão
**Toque e fale** é ligado ao reconhecimento de voz do Android em português. O texto
reconhecido preenche o formulário original para revisão; não salva automaticamente.
A permissão de microfone é pedida pelo Android, e a escuta para ao sair da tela.

O despertador continua nativo: `AlarmManager.setAlarmClock`, serviço de áudio,
melodia local em repetição, vibração e intenção de tela cheia. A tela do alarme
usa fundo azul em degradê, letras grandes e botão dourado **PARAR AVISO · JÁ VI**.
A agenda não precisa estar aberta na hora do alarme já sincronizado.

## Atualizar e testar antes de entregar

1. Instale o APK atualizado por cima da versão 0.1; ele tem o mesmo pacote e
   assinatura, com `versionCode=2`. Abra **Minha Agenda**.
2. A sessão anterior é reaproveitada quando disponível. Se necessário, entre
   com o mesmo PIN. Nenhum compromisso é copiado para outra agenda.
3. Toque no microfone da agenda, depois em **Toque e fale**, e permita o microfone.
   Exemplo: “Agendar reunião amanhã às 9 horas na Prefeitura”. Confira os dados
   reconhecidos e toque em **Salvar**, como no site.
4. Aguarde a confirmação **Alarmes sincronizados** no botão discreto inferior.
5. Toque em **Despertador → Configurar e testar → Testar alarme em 30 segundos**.
   Se faltar uma permissão, o teste abre a configuração correspondente. Depois
   de liberar todas e voltar, o teste pode ser agendado automaticamente.
6. Volte para a tela inicial e bloqueie o aparelho. Verifique som, tela grande e
   parada pelo botão. Se falhar, abra **Diagnóstico do último teste**.

## Correções após o primeiro teste no aparelho

A usuária informou que a versão 0.1 não despertou; ainda não foi identificada a
etapa exata da falha. A versão 0.2 deixa de apenas recusar o teste silenciosamente
quando faltam permissões e conduz à configuração necessária. O diagnóstico local
registra agendamento, chamada pelo Android, início do serviço, início do áudio e
confirmação. Não registra título, PIN, token nem fala. Caso o MediaPlayer falhe,
o serviço tenta o som de alarme do próprio aparelho.

**Isso não comprova a correção no aparelho físico:** novo teste é obrigatório
antes de usar para reuniões importantes ou entregar à Cláudia.

## Arquitetura e segurança

- Interface carregada por HTTPS de `nfs-gestao-oficial.vercel.app`, sem acesso a
  arquivos locais, conteúdo misto, depuração web ou janelas adicionais.
- A ponte JavaScript só fornece voz e pedido de sincronização. Não expõe PIN,
  sessão, leitura de arquivos, configurações ou execução de RPC arbitrário.
  Seus métodos conferem origem e rota da agenda antes de executar.
- Recursos externos limitados ao projeto Supabase já utilizado e fontes Google.
  Navegação externa é bloqueada; permissões web são negadas. Microfone é nativo.
- A sessão da interface fica no armazenamento privado do WebView, como no site.
  A cópia de sessão/cache do agendador é cifrada por AES-GCM no Android Keystore.
  A sessão é validada no servidor por `agenda_exec_eu` antes de sincronizar.
- Salvamentos e mudanças da interface solicitam atualização do agendador.
  Sair da agenda remove os alarmes e a sessão nativa desta instalação.
- Mesmos RPCs e autorização por token. O APK inclui só chave pública da API.
  Não altera banco, regras de acesso, titulares ou dados de outras pessoas.

## Limites

- Internet é necessária para abrir/usar a interface e reconhecer voz, conforme
  o serviço de reconhecimento disponível no aparelho. Alarmes já sincronizados
  continuam locais e não precisam da internet na hora do aviso.
- Horário de Ibiúna (`America/Sao_Paulo`), próximos 90 dias; aviso antecipado e
  na hora independentes. Concluídos, sem horário e Não avisar não despertam.
- Mudanças feitas em outro aparelho/site chegam após atualização ou JobScheduler,
  cujo intervalo é de 15 minutos ou mais, sujeito ao Android e à conexão.
- Android decide a apresentação: bloqueado pode abrir a tela; em uso pode mostrar
  um aviso no topo. Permissões, volume, Não perturbe, Forçar parada, restrições de
  bateria e aparelho desligado interferem no resultado. Não usa sobreposição global.
- Android 9 ou posterior. Versão de teste, sem Play Store nem atualização automática.
  Não é versão iPhone. Depois de validar, desligue avisos antigos do navegador se
  não quiser notificações duplicadas.

## Construção e validação

Java 17 (ou Eclipse JDT 3.42.0), Android SDK API 36, Build Tools 36.0.0, Python 3 e zip.
Defina as variáveis indicadas em `build.sh`; o keystore usa alias `minha-agenda`.
Não comite a chave de assinatura nem a senha.

```bash
bash build.sh
node tests/native-voice.test.mjs
```

Validação: testes Java de horários/fuso/reagendamento/opt-out/concluídos; teste da
ponte de voz (parcial/final/permissão negada/preenchimento sem salvar); compilação,
DEX, alinhamento e assinatura do APK. Pendente: teste completo no aparelho físico,
incluindo microfone, interpretação/revisão, salvar/sincronizar, bloqueio, som e parada.

Referências: https://developer.android.com/develop/ui/views/notifications/time-sensitive
 e https://developer.android.com/develop/background-work/services/alarms/schedule
