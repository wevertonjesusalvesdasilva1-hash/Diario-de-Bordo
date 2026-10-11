# HoraExtra — Controle de Presença e Produção em Turno

Aplicação web mobile-first para controle de presença, paradas de produção na linha do tempo vertical, saídas antecipadas, realocação de peças e relatórios gerenciais com importação e exportação Excel (`.xlsx`).

## Como fazer o Deploy na Vercel

Esta pasta já está 100% configurada para deploy imediato na **Vercel** (`vercel.json` + `.npmrc` + build Vite configurado para a pasta `dist`).

### Opção 1: Via GitHub (Recomendado)
1. Suba esta pasta para um repositório no seu **GitHub**.
2. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório.
3. A Vercel detectará automaticamente as configurações do `vercel.json`:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install --legacy-peer-deps`
4. Clique em **Deploy**.

### Opção 2: Direto pelo Terminal (Vercel CLI)
Na raiz desta pasta, execute:

```bash
npx vercel --prod
```

## Comandos Locais

```bash
# Instalar dependências
npm install

# Rodar ambiente de desenvolvimento (porta 3000)
npm run dev

# Gerar build de produção (pasta dist/)
npm run build
```
