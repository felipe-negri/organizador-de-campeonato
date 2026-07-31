# 🏆 Organizador de Campeonato

Dashboard interativo para campeonatos com fase de pontos corridos e mata-mata.  
Dados em **tempo real** via Firebase Firestore. Hospedado no GitHub Pages.

**[➡️ Abrir Dashboard](https://felipe-negri.github.io/organizador-de-campeonato/)**

---

## ✨ Funcionalidades

- 📊 **Classificação** — Tabela de pontos corridos com cálculo automático
- ⚽ **Jogos** — Navegação por rodadas com placar de cada partida
- 🏆 **Mata-Mata** — Bracket visual de play-in → quartas → semis → 3º lugar → final
- 🎾 **Sets nas decisões** — Semifinais, disputa de 3º lugar e final são melhor de 3 sets
- 🔴 **Tempo real** — Todos os espectadores veem os placares atualizando ao vivo
- 🔐 **Admin protegido** — Apenas o organizador (logado) pode editar dados
- 🌙 **Tema escuro/claro** — Escuro como padrão, alternável pelo botão
- 📱 **Responsivo** — Funciona em celular, tablet e desktop

---

## 🚀 Configuração do Firebase

### 1. Projeto Firebase (já criado)

O projeto está em: `organizador-de-campeonato` no Firebase Console.

### 2. Adicionar usuário administrador

1. Acesse o [Firebase Console](https://console.firebase.google.com)
2. Vá em **Authentication → Users → Adicionar usuário**
3. Cadastre seu email e senha
4. Esse login será usado para acessar o painel admin no dashboard

### 3. Configurar regras do Firestore

1. No Firebase Console, vá em **Firestore Database → Regras**
2. Substitua o conteúdo pelo arquivo `firestore.rules` deste repositório:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

3. Clique em **Publicar**

### 4. Ativar GitHub Pages

1. Vá em **Settings → Pages** do repositório
2. Source: `Deploy from a branch` → `main` / `/(root)`
3. Clique em **Save**

---

## 🧪 Testar localmente (sem impactar produção)

O app aponta pro Firebase de produção por padrão, mas em `localhost`/`127.0.0.1` ele
detecta sozinho e conecta nos **emuladores locais** de Firestore e Auth em vez disso
(ver `app.js` e `obs-overlay.html`, logo após o `initializeApp`) — dado nenhum sai
daqui pra produção.

### Pré-requisitos

- **Java 21+** (o emulador do Firestore exige). Neste ambiente (`void`) já instalado
  em `/usr/lib/jvm/java-21-openjdk`, sem mexer no Java padrão do sistema — o script
  do emulador aponta pra ele via `PATH` só na hora de rodar.
- `firebase-tools` já vem como devDependency (`node_modules/.bin/firebase`).

### Subir o ambiente

```bash
npm run emulators   # Firestore :8080, Auth :9099, UI em http://localhost:4321
npm run serve       # noutro terminal: serve o app em http://localhost:4567
```

### Criar um usuário admin no emulador

O `usuarios`/`roles` do Firestore fica vazio no emulador — no primeiro login o app
**semeia sozinho** um papel `admin` com todas as permissões para
`felipe.negri43@gmail.com` (ver `loadRolesAndUsers` em `app.js`). Só falta criar essa
conta no **Auth emulator** (ele não compartilha usuários com produção):

- Pela UI: `http://localhost:4321/auth` → **Add user**.
- Ou via API, sem abrir nada:
  ```bash
  curl -X POST "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
    -H 'Content-Type: application/json' \
    -d '{"email":"felipe.negri43@gmail.com","password":"SUASENHA","returnSecureToken":true}'
  ```

Depois é só abrir `http://localhost:4567`, logar com esse email/senha, e a aba
**⚙️ Admin** aparece com todas as permissões.

### Importar o backup de produção

Com o usuário admin logado: **Admin → Backup → Importar dados** → selecione o JSON
exportado de produção (o mesmo botão **Exportar dados** gera esse arquivo). O import
roda a mesma função de sempre (`importData`), só que escrevendo no Firestore *local*
— pode testar à vontade, editar placares, quebrar o bracket, que produção não sente
nada. Pra recomeçar do zero, é só parar e subir os emuladores de novo (o estado não
persiste entre execuções, a menos que rode com `--export-on-exit`/`--import`).

---

## 🎮 Como usar o Dashboard

### Primeiro acesso (Admin)

1. Abra o dashboard
2. Clique em **🔐** no canto superior direito (ou "Entrar como Admin")
3. Faça login com o email/senha cadastrado no Firebase
4. A aba **⚙️ Admin** aparecerá na navegação

### Configurar o campeonato (Admin)

Na aba Admin:

1. **Configurações** — Nome do campeonato e quantos times se classificam para o mata-mata
2. **Times** — Adicione cada time com nome, sigla e cor
3. **Partidas** — Adicione as partidas da fase de grupos (rodada, mandante, visitante)
4. **Mata-Mata** — Clique em "Inicializar Bracket" para criar a estrutura
   (play-in + quartas + semis + disputa de 3º lugar + final)

### Lançar resultados (Admin)

- **Fase de grupos:** Na aba Jogos, clique no botão ✏️ de qualquer partida
- **Mata-Mata:** Na aba Mata-Mata, clique no botão ✏️ de cada partida do bracket
- Os resultados aparecem em **tempo real** para todos os espectadores

---

## 🎾 Regra das decisões (semifinais, 3º lugar e final)

Essas três partidas **não** são de placar corrido: são **melhor de 3 sets**, no estilo do tênis.

| Set | Vai até | Como fecha |
|-----|---------|------------|
| 1º e 2º | 21 pontos | ≥ 21 pontos **e** 2 de vantagem |
| 3º (decisivo) | 15 pontos | ≥ 15 pontos **e** 2 de vantagem |

A vantagem de 2 vale sempre e **não há teto**: `21×19` fecha, mas `21×20` continua até
`22×20`, `23×21`, e assim por diante. **Quem levar 2 sets vence a partida** — então o
3º set só é jogado quando está 1 a 1.

**Disputa de 3º lugar:** criada junto com o bracket e preenchida automaticamente com
os **perdedores das duas semifinais** assim que elas terminam (o admin ainda pode
trocar os times na mão pelo ✏️).

**Como lançar o placar:**
- **✏️ Editar** — o modal troca os campos de gols/pênaltis por três linhas de set.
  O placar é validado: um set que não fecha pela regra (ex.: `25×21`, que teria
  acabado em `23×21`) é recusado.
- **▶ Ao Vivo** — cada `+` marca **um ponto do set em disputa**. O set fecha sozinho
  quando a regra bate e o próximo já abre; o `−` num set recém-aberto desfaz o ponto
  que fechou o anterior.

Nas telas e no overlay do OBS, o **placar principal são os sets** (ex.: `2 × 1`), com
o detalhe set a set logo abaixo (`21-18 · 19-21 · 15-13`).

Quartas e play-in seguem no placar simples de gols + pênaltis, sem mudança.

### Visão dos espectadores

Basta abrir o link do GitHub Pages — os dados atualizam automaticamente ao vivo, sem precisar de login.

---

## 🛠️ Tecnologias

- HTML5 + CSS3 + JavaScript puro (sem framework)
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — banco de dados em tempo real
- [Firebase Authentication](https://firebase.google.com/docs/auth) — login do administrador
- [Google Fonts (Inter)](https://fonts.google.com/specimen/Inter)
- GitHub Pages — hospedagem gratuita

---

## 📌 Estrutura dos dados no Firestore

| Coleção | Documento/Campos |
|---------|-----------------|
| `config/main` | `nome_campeonato`, `classificados` |
| `times/{id}` | `nome`, `sigla`, `cor` |
| `jogos/{id}` | `rodada`, `mandante`, `visitante`, `gols_mandante`, `gols_visitante`, `ordem` |
| `mata_mata/{id}` | `fase`, `time1`, `time2`, `gols1`, `gols2`, `pen1`, `pen2`, `ordem`, `sets` |

`fase` é `playin` \| `quartas` \| `semis` \| `terceiro` \| `final`.

Nas fases por set (`semis`, `terceiro`, `final`), `sets` é um array de até 3 objetos
`{ p1, p2 }` com os pontos de cada set, e **`gols1`/`gols2` guardam os sets ganhos** —
por isso o placar `2 × 1` continua saindo de `gols1`/`gols2` em toda a aplicação.
Partidas antigas dessas fases, sem o campo `sets`, seguem sendo lidas pelo placar simples.
