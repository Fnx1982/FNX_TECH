# FNX TECH — como colocar no ar

O site é o mesmo sistema da Eng Job, adaptado para a FNX TECH, com um backend **separado** (Worker novo, KV novo, R2 novo). Nenhum dado da Eng Job é lido nem gravado.

## 1. Criar o backend no Cloudflare (pelo navegador)

1. **Storage & Databases → KV → Create namespace** → nome `fnx-tech-dados`.
2. **R2 → Create bucket** → nome `fnx-tech-arquivos`.
3. **Workers & Pages → Create → Worker** → nome `fnx-tech-api` → Deploy.
4. **Edit code** → apague tudo → cole o arquivo **`fnx-worker.js`** inteiro → **Deploy**.
5. No Worker, **Settings → Bindings**:
   - **KV namespace**: variável `FNX_KV` → `fnx-tech-dados`
   - **R2 bucket**: variável `FNX_R2` → `fnx-tech-arquivos`
6. **Settings → Variables and Secrets**:
   - `ADMIN_REGISTRO` (Text) → o registro do primeiro administrador, ex.: `1000`
   - `ADMIN_SENHA` (Secret) → senha inicial dele
   - `ALLOWED_ORIGINS` (Text, recomendado) → endereço do site, ex.: `https://fnx1982.github.io`
   - Opcionais: `RESEND_API_KEY` (Secret) + `RESEND_FROM` (Text) para "Recuperar senha" por e-mail; `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Secret) para o Google Agenda.
7. Copie a URL do Worker (`https://fnx-tech-api.<seu-usuario>.workers.dev`).

## 2. Ligar o site ao Worker

Abra **`config.js`** e troque `FNX_API` pela URL do passo 1.7. No mesmo arquivo ficam os dados da empresa (CNPJ, endereço, e-mail…), os links das mídias sociais e as chaves do Google — tudo em branco por enquanto.

## 3. Publicar o site

Suba o conteúdo da pasta num repositório novo do GitHub e ative **Settings → Pages** (branch `main`, pasta raiz). A página de entrada é `login.html` (o `index.html` só redireciona para ela).

## 4. Primeiro acesso

Entre com `ADMIN_REGISTRO` / `ADMIN_SENHA`. Enquanto não existir nenhum usuário, esse login cria o administrador (setor Diretoria) e pede uma senha nova. Depois disso as variáveis não criam mais contas; cadastre o resto da equipe em **Cadastro**.

## O que mudou em relação à Eng Job

- Nome, cores (laranja, preto, vermelho e âmbar) e rodapé "Created by Yan Victor · @yanszaida" em todas as páginas.
- Logo, fundo do login e imagens dos PDFs **em branco** (`logo-empresa.js` e `apresentacao-imagens.js` recebem o base64 quando a arte ficar pronta).
- Financeiro: saíram Inter/Sicredi/Credcrea e os extratos fixos; entrou **Gerenciamento de Contas** (`contas-bancarias.html`) — cadastre quantas contas quiser, cada uma com seu extrato. Boletos e Relatórios usam essas contas.
- Novo menu **Quadros** (`quadros.html`): quadros estilo Trello com listas, cartões arrastáveis (no celular: segure o cartão e arraste), etiquetas, prazo, responsáveis, checklist, comentários e capa. Quem é colocado num cartão recebe notificação no sino.
- Emissão de notas continua marcada "em breve" (o Worker responde "em desenvolvimento").
- Removidas as páginas órfãs `materiais.html`, `servicos.html` e `materiais.js`.
