# Minimal Note

App de notas em Markdown, local e personalizável, inspirado no Obsidian — feito com Electron.

![ícone](build/icon.png)

## Recursos

- **Arquivos `.md` comuns** numa pasta (o *cofre*), sem banco de dados nem nuvem
- **Links `[[wiki]]`** com autocompletar, backlinks e renomeação que atualiza os links
- **Grafo** interativo das notas, tags e links não criados
- **Editor, leitura e modo dividido**, com listas inteligentes, atalhos de formatação e colagem de imagens
- **Callouts** (`> [!tip]`), tarefas clicáveis, tabelas, destaques `==texto==`, frontmatter YAML
- **Busca** em todo o cofre, painel de tags, sumário, nota diária e paleta de comandos (`Ctrl+P`)
- **11 temas**, cor de destaque, cores do tema editáveis, fontes, tamanhos, efeitos de vidro e fundo animado
- **Criador de temas**: gere uma paleta a partir de uma cor, ajuste cada cor (inclusive títulos, links, tags e marca-texto), veja a pré-visualização ao vivo, confira o contraste e salve seus próprios temas
- **CSS personalizado** e exportação/importação de temas em JSON (texto ou arquivo)
- Exportação para **HTML** e **PDF**
- Layout **responsivo** (barras laterais viram gavetas em telas estreitas)

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
sudo apt install ./dist/minimal-note_1.1.0_amd64.deb
```

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
