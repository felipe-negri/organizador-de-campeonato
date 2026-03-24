# 🏆 Organizador de Campeonato

Dashboard interativo para campeonatos com fase de pontos corridos e mata-mata.  
Os dados ficam em uma planilha do Google Sheets e o dashboard é hospedado no GitHub Pages.

**[➡️ Abrir Dashboard](https://felipe-negri.github.io/organizador-de-campeonato/)**

---

## ✨ Funcionalidades

- 📊 **Classificação** — Tabela de pontos corridos com cálculo automático
- ⚽ **Jogos** — Navegação por rodadas com placar de cada partida
- 🏆 **Mata-Mata** — Bracket visual de quartas → semis → final
- 🌙 **Tema escuro/claro** — Escuro como padrão, alternável pelo botão
- 📱 **Responsivo** — Funciona em celular, tablet e desktop
- 🔒 **Sem permissões expostas** — Usa planilha publicada na web (somente leitura)
- ⚙️ **Configurável** — Cole o link da planilha direto no dashboard

---

## 📋 Como Configurar a Planilha

### 1. Crie uma nova planilha no Google Sheets

Acesse [sheets.google.com](https://sheets.google.com) e crie uma nova planilha.

### 2. Crie as 4 abas (exatamente com estes nomes):

| Aba | Descrição |
|-----|----------|
| `Config` | Configurações gerais do campeonato |
| `Times` | Lista de times participantes |
| `Fase_Grupos` | Todos os jogos da fase de pontos corridos |
| `Mata_Mata` | Jogos do mata-mata (quartas, semis, final) |

### 3. Preencha cada aba:

#### Aba `Config`

| Chave | Valor |
|-------|-------|
| nome_campeonato | Meu Campeonato 2026 |
| classificados | 8 |

#### Aba `Times`

| Nome | Sigla | Cor |
|------|-------|-----|
| Flamengo | FLA | #C62828 |
| Palmeiras | PAL | #2E7D32 |
| Santos | SAN | #212121 |
| São Paulo | SAO | #FF1744 |
| Corinthians | COR | #000000 |
| Grêmio | GRE | #1565C0 |
| Internacional | INT | #B71C1C |
| Cruzeiro | CRU | #1A237E |
| Atlético-MG | CAM | #212121 |
| Fluminense | FLU | #880E4F |
| Vasco | VAS | #212121 |
| Botafogo | BOT | #1B1B1B |

> 💡 Coloque quantos times quiser. A coluna `Cor` aceita qualquer cor em hexadecimal.

#### Aba `Fase_Grupos`

| Rodada | Mandante | Visitante | Gols_Mandante | Gols_Visitante |
|--------|----------|-----------|---------------|----------------|
| 1 | Flamengo | Palmeiras | 2 | 1 |
| 1 | Santos | Corinthians | 0 | 0 |
| 1 | São Paulo | Grêmio | 1 | 3 |
| 2 | Palmeiras | Santos | 2 | 2 |
| ... | ... | ... | ... | ... |

> 💡 Deixe `Gols_Mandante` e `Gols_Visitante` em branco para jogos ainda não realizados.

#### Aba `Mata_Mata`

| Fase | Time1 | Time2 | Gols1 | Gols2 | Penaltis1 | Penaltis2 |
|------|-------|-------|-------|-------|-----------|----------|
| quartas | Flamengo | Botafogo | 2 | 1 | | |
| quartas | Palmeiras | Vasco | 3 | 0 | | |
| quartas | Santos | Cruzeiro | 1 | 1 | 4 | 3 |
| quartas | Grêmio | São Paulo | | | | |
| semis | | | | | | |
| semis | | | | | | |
| final | | | | | | |

> 💡 Valores de `Fase`: `quartas`, `semis`, `final`  
> 💡 Colunas `Penaltis1` e `Penaltis2` são opcionais (só para empates no mata-mata).  
> 💡 Deixe `Time1`, `Time2`, `Gols1`, `Gols2` em branco para jogos a definir.

### 4. Publique a planilha na web

1. Na planilha, vá em **Arquivo → Compartilhar → Publicar na web**
2. Selecione **Documento inteiro** e formato **Página da web**
3. Clique em **Publicar**
4. Copie o link da planilha (da barra de endereço, não o link de publicação)

### 5. Configure no Dashboard

1. Abra o dashboard
2. Clique em ⚙️ (Configurações)
3. Cole o link da planilha
4. Clique em **Salvar e Carregar**

---

## 🚀 Deploy no GitHub Pages

1. Vá nas **Settings** do repositório
2. Na seção **Pages**, selecione:
   - **Source**: Deploy from a branch
   - **Branch**: `main` / `/ (root)`
3. Clique em **Save**
4. Aguarde alguns minutos e acesse: `https://SEU_USUARIO.github.io/organizador-de-campeonato/`

---

## 🛠️ Tecnologias

- HTML5 + CSS3 + JavaScript puro (sem framework)
- [Papa Parse](https://www.papaparse.com/) para parsing de CSV
- [Google Fonts (Inter)](https://fonts.google.com/specimen/Inter)
- Google Sheets como "banco de dados" (publicado na web, sem API key)

---

## 📌 Dicas

- **Atualização automática**: Sempre que alterar a planilha, clique em 🔄 no dashboard para atualizar
- **Quantos times quiser**: Funciona com qualquer número de times
- **Múltiplos campeonatos**: Crie planilhas diferentes para cada campeonato
- **Temas**: O dashboard salva sua preferência de tema no navegador
