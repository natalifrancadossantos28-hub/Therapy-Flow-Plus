# Minha Agenda — Android, versão de teste 0.1

Aplicativo Android nativo para os mesmos perfis e compromissos da agenda NFs.
Não altera o banco nem cria outros titulares. A sessão usa o PIN existente e os
RPCs com autorização por token. O APK contém somente a chave pública da API,
nunca chave administrativa, PIN de usuário ou segredo do servidor.

## Instalação e primeiro teste

1. Baixe `Minha-Agenda-Android-teste.apk` no Android 9 ou posterior e instale.
   O Android pode pedir autorização para instalar pelo aplicativo usado no download.
2. Abra **Minha Agenda**, escolha o nome e entre com o mesmo PIN da agenda.
3. Libere **Notificações**, **Alarmes e lembretes** e, quando solicitado,
   **Aviso em tela cheia**. Os botões levam às telas do próprio Android.
4. Confira o volume de **alarme**, que é separado do volume de mídia.
5. Toque em **Testar alarme em 30 segundos**, volte à tela inicial e bloqueie
   a tela. A música deve tocar, e **PARAR AVISO · JÁ VI** deve encerrá-la.
6. Repita o teste com o aparelho em uso, depois teste um compromisso real.
   Após confirmar o funcionamento nativo, os avisos do site podem ser desligados
   em cada navegador para evitar receber avisos duplicados.

## Funcionamento e limites

- Usa `AlarmManager.setAlarmClock`, sem navegador, WebView ou JavaScript em segundo plano.
- Horários de Ibiúna: `America/Sao_Paulo`. Aviso na hora independente da antecedência.
- Alarme com serviço de reprodução de áudio; melodia local em repetição e vibração
  até confirmação. Chamadas e configurações de áudio do Android são respeitadas.
- Notificação de categoria ALARM com intenção de tela cheia. O Android decide
  a apresentação: bloqueado pode abrir a tela; em uso pode exibir um aviso no topo.
  Não força sobreposição sobre outros aplicativos nem contorna o bloqueio de segurança.
- Os próximos 90 dias são sincronizados. Alarmes já sincronizados não precisam
  de internet e são restaurados após reinício/deslocamento de relógio/fuso.
- Criar, editar ou concluir pelo aplicativo atualiza os alarmes locais imediatamente
  após a resposta do servidor. Alterações no site/outro aparelho só valem localmente
  após **Atualizar** ou uma sincronização de segundo plano (`JobScheduler`, intervalo
  mínimo de 15 minutos, sujeito a bateria e disponibilidade de rede). Não há
  sincronização remota instantânea nesta versão.
- **Não avisar**, dia todo e concluídos não criam alarme. Sair remove os alarmes
  desta instalação e revoga a sessão, preservando os compromissos no servidor.
- Celular desligado, **Forçar parada**, restrições de bateria, permissões revogadas,
  volume zerado e Não perturbe podem impedir o aviso. Faça o teste no aparelho físico.
- Não é versão iPhone nem publicação na Play Store. Não há atualização automática.

## Segurança e construção

Dados de sessão e cache são cifrados com AES-GCM usando Android Keystore. Backup
desativado. Comunicação HTTPS somente com o projeto Supabase existente. Componentes
de alarme não exportados; o serviço de JobScheduler exige permissão do sistema.

Construção sem Gradle e sem bibliotecas de terceiros: Java 17, Android SDK API 36,
Build Tools 36.0.0, Python 3 e zip. A compilação local também foi verificada com
Eclipse JDT 3.42.0 sobre Java 17. Defina as variáveis listadas em `build.sh` e execute:

```bash
bash build.sh
```

O keystore deve conter o alias `minha-agenda`; a senha é lida de um arquivo privado.
Não comite nem compartilhe chaves de assinatura. O APK entregue tem assinatura de
desenvolvimento. Uma distribuição definitiva precisa conservar sua chave privada
para permitir atualizações compatíveis.

## Validação realizada

- Compilação das classes e recursos, geração de DEX, alinhamento e verificação da
  assinatura do APK.
- Testes Java das regras de fuso, hora, antecedência, ausência de duplicatas,
  reagendamento, opt-out, concluídos, dia todo e datas inválidas.
- Consulta de leitura ao RPC público de perfis do projeto correto; nenhum PIN real
  foi acessado e nenhum compromisso de produção foi criado durante os testes.
- Inspeção do manifesto e da disponibilidade da melodia no APK.

**Pendente:** instalação, login, volume, tela bloqueada, toque, parada, reboot e
sincronização no Android físico. Compilação não comprova esses comportamentos.

Referências oficiais consultadas:
- https://developer.android.com/develop/ui/views/notifications/time-sensitive
- https://developer.android.com/develop/background-work/services/alarms/schedule
