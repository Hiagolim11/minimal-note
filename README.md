# Minimal Note

App de notas em Markdown, local e personalizável, inspirado no Obsidian — feito com Electron (Windows e Linux) e Capacitor (Android).

![ícone](build/icon.png)

## Recursos

- **Arquivos `.md` comuns** numa pasta (o *cofre*), sem banco de dados nem nuvem
- **Links `[[wiki]]`** com autocompletar, backlinks e renomeação que atualiza os links
- **Grafo** interativo das notas, tags e links não criados
- **Editor, leitura e modo dividido**, com listas inteligentes, atalhos de formatação e colagem de imagens
- **Callouts** (`> [!tip]`), tarefas clicáveis, tabelas, destaques `==texto==`, frontmatter YAML
- **Busca** em todo o cofre, painel de tags, sumário, nota diária e paleta de comandos (`Ctrl+P`)
- **11 temas**, cor de destaque, cores do tema editáveis, fontes, tamanhos, efeitos de vidro e fundo animado
- **Partículas e cursor**: fundo animado (poeira de luz, vaga-lumes, estrelas, neve, bokeh ou bolhas) e efeitos no ponteiro (brilhos em estrela, rastro de luz, aura ou confete, com explosão ao clicar). Estilos prontos, controle de quantidade, velocidade, tamanho, intensidade, cor e reação ao mouse. Tudo roda num único loop leve que pausa com a janela minimizada e respeita "reduzir movimento"
- **Criador de temas**: gere uma paleta a partir de uma cor, ajuste cada cor (inclusive títulos, links, tags e marca-texto), veja a pré-visualização ao vivo, confira o contraste e salve seus próprios temas
- **CSS personalizado** e exportação/importação de temas em JSON (texto ou arquivo)
- Exportação para **HTML** e **PDF**
- Layout **responsivo** (barras laterais viram gavetas em telas estreitas e, no celular, a faixa de ícones vira uma barra de navegação embaixo)
- **App Android** com a mesma interface: cofre em qualquer pasta do aparelho (ex.: sincronizada), barra de formatação acima do teclado, compartilhar textos/links para virar nota, “Abrir com” para arquivos `.md`, atalhos no ícone (nova nota, nota diária, buscar), PDF pela impressão do Android, backup em `.zip` e lixeira do cofre

## Desenvolvimento

```bash
npm install
npm start
```

## Gerar instaladores

```bash
npm run dist:win     # instalador .exe (NSIS) em dist/
npm run dist:linux   # pacote .deb em dist/
```

O `.deb` é montado por `build/make-deb.js` a partir de `dist/linux-unpacked`, então também funciona a partir do Windows.

Instalar no Linux (Debian/Ubuntu):

```bash
sudo apt install ./dist/minimal-note_1.3.0_amd64.deb
```


## Android (APK)

O app Android usa o [Capacitor](https://capacitorjs.com) com a mesma interface de `src/`.

- `src/js/android-bridge.js` implementa a API `window.lumen` no Android
- `android/app/src/main/java/com/minimalnote/app/MinimalNotePlugin.java` é o plugin nativo: arquivos do cofre (com acesso a todos os arquivos, se o usuário permitir), textos e arquivos recebidos de outros apps, atalhos do ícone, compartilhar, impressão/PDF, backup `.zip` e cores das barras do sistema
- `MainActivity.java` afasta a WebView das barras do sistema **e do teclado** no Android 15+ (tela de ponta a ponta)
- `src/js/mobile.js` cuida da barra de formatação, do teclado e do gesto de abrir os arquivos pela borda

Requisitos: JDK 21 e Android SDK (plataforma 35). Em seguida:

```bash
npm install
npm run android:apk      # gera android/app/build/outputs/apk/release/app-release.apk
```

O APK final é assinado com uma chave que **não** fica no repositório. Crie um arquivo de propriedades em `~/.android/minimal-note-signing.properties` (ou aponte a variável `MINIMAL_NOTE_SIGNING` para ele):

```properties
storeFile=C:/caminho/minimal-note-release.jks
storePassword=...
keyAlias=minimalnote
keyPassword=...
```

Sem esse arquivo o APK de release sai sem assinatura (use `gradlew assembleDebug` para testar). Guarde a chave com cuidado: atualizações só instalam por cima se forem assinadas com a mesma chave.

- `npm run android:www` gera a pasta `www/` (interface, runtime do Capacitor e dependências, sem `node_modules`)
- `npm run android:assets` recria ícones e tela de abertura a partir de `build/icon.png` e ajusta a versão
- No primeiro uso o app pergunta onde guardar as notas: em `Documentos/Minimal Note` (com acesso aos arquivos) ou na pasta privada do app. Dá para trocar depois em **Configurações → Cofre e arquivos**
- No Windows, faça o build numa pasta de caminho curto (ex.: `C:\dev\minimal-note`): os caminhos do Gradle passam do limite de 260 caracteres

## Atalhos principais

| Ação | Atalho |
| --- | --- |
| Nova nota | `Ctrl+N` |
| Paleta / abrir nota | `Ctrl+P` |
| Comandos | `Ctrl+Shift+P` |
| Edição ↔ leitura | `Ctrl+E` |
| Modo dividido | `Ctrl+\` |
| Grafo | `Ctrl+G` |
| Nota diária | `Ctrl+Shift+D` |
| Configurações | `Ctrl+,` |

## Licença

MIT
