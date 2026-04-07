# 🔔 Web Push Notifications - Guia de Ativação

## Pré-requisitos

1. **Firebase Blaze Plan** (pay-as-you-go)  
   - Acesse [Firebase Console](https://console.firebase.google.com/) → Projeto → ⚙️ → Plano de uso  
   - Mude para Blaze (tem faixa gratuita generosa - 125K invocações/mês grátis)

2. **Firebase CLI** instalado  
   ```bash
   npm install -g firebase-tools
   ```

## Passo a Passo

### 1. Gerar chave VAPID

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Vá em **⚙️ Configurações do Projeto → Cloud Messaging**
3. Na seção **Web Push certificates**, clique em **Generate key pair**
4. Copie a chave pública gerada
5. No arquivo `app.js`, substitua `'SUA_VAPID_KEY_AQUI'` pela chave copiada

### 2. Deploy das Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 3. Testar

1. Abra o site e clique no 🔔 no header
2. Aceite a permissão de notificações
3. Inicie um jogo ao vivo
4. A notificação push deve chegar em todos os dispositivos inscritos

## Como Funciona

```
Juiz atualiza placar → Firestore salva → Cloud Function detecta mudança
                                          ↓
                                   Busca tokens FCM na coleção `push_tokens`
                                          ↓
                                   Envia push para todos os inscritos
                                          ↓
                              Service Worker exibe a notificação
```

## Eventos Notificados

| Evento | Título | Corpo |
|--------|--------|-------|
| Jogo começou | 🔴 Jogo Ao Vivo! | Time A vs Time B começou agora! |
| Gol marcado | ⚽ GOL! Time A | Time A 2 × 1 Time B |
| Jogo terminou | 🏁 Fim de Jogo! | Time A 2 × 1 Time B |

## Custos Estimados

- **Cloud Functions**: ~125K invocações/mês grátis
- **FCM**: Gratuito (sem limites)
- **Firestore reads extras**: mínimo (1 read por push para buscar tokens)

Na prática, para um campeonato amador, o custo será **R$ 0,00**.

## Fallback (sem Blaze)

Mesmo sem ativar o plano Blaze:
- ✅ **Toast in-app** funciona (quando o usuário está com o site aberto)
- ✅ **Browser Notification API** funciona (se o site está aberto e permissão concedida)
- ❌ **Web Push** (notificação com site fechado) **não funciona** sem Cloud Functions
