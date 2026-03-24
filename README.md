# 🏆 Organizador de Campeonato

Dashboard interativo para campeonatos com fase de pontos corridos e mata-mata.  
Dados em **tempo real** via Firebase Firestore. Hospedado no GitHub Pages.

**[➡️ Abrir Dashboard](https://felipe-negri.github.io/organizador-de-campeonato/)**

---

## ✨ Funcionalidades

- 📊 **Classificação** — Tabela de pontos corridos com cálculo automático
- ⚽ **Jogos** — Navegação por rodadas com placar de cada partida
- 🏆 **Mata-Mata** — Bracket visual de quartas → semis → final
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
4. **Mata-Mata** — Clique em "Inicializar Bracket" para criar a estrutura (quartas + semis + final)

### Lançar resultados (Admin)

- **Fase de grupos:** Na aba Jogos, clique no botão ✏️ de qualquer partida
- **Mata-Mata:** Na aba Mata-Mata, clique no botão ✏️ de cada partida do bracket
- Os resultados aparecem em **tempo real** para todos os espectadores

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
| `mata_mata/{id}` | `fase`, `time1`, `time2`, `gols1`, `gols2`, `pen1`, `pen2`, `ordem` |
