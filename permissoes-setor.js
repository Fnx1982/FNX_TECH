// ============================================================
// permissoes-setor.js
// Define quais itens do menu cada SETOR pode ver. Usado tanto na
// tela de Cadastro (gerenciarcontas.html, para configurar) quanto
// no home.js (para aplicar a visibilidade do menu).
//
// Armazenamento: localStorage["setoresPermissoes"], um objeto:
//   { "Financeiro": ["financeiro-menu", "relatorios-menu", ...], ... }
// Setores sem entrada aqui ainda (recém-criados) não liberam nada
// até alguém configurar as permissões deles.
// ============================================================

const CHAVE_SETORES_PERMISSOES = "setoresPermissoes";

// Todos os itens de menu que existem no site, com um rótulo amigável
// para exibir nos checkboxes de configuração.
const ITENS_MENU_DISPONIVEIS = [
  { id: "gerenciarcontas-menu", rotulo: "Equipe & Acessos" },
  { id: "financeiro-menu", rotulo: "Financeiro" },
  { id: "comissao-menu", rotulo: "Comissões" },
  { id: "relatorios-menu", rotulo: "Métricas & Relatórios" },
  { id: "obras-menu", rotulo: "Projetos" },
  { id: "gestaomaterial-menu", rotulo: "Catálogo de Serviços" },
  { id: "armazenamento-menu", rotulo: "Drive" },
  { id: "boletos-menu", rotulo: "Cobranças" },
  { id: "clientes-crm-menu", rotulo: "CRM / Pipeline" },
  { id: "quadros-menu", rotulo: "Boards (estilo Trello)" },
  { id: "notas-menu", rotulo: "Fiscal" },
  { id: "propostas-menu", rotulo: "Comercial" },
  { id: "reuniao-menu", rotulo: "Meetings" },
  { id: "midias-menu", rotulo: "Mídias Sociais" },
  { id: "pontos-menu", rotulo: "Banco de Horas (Confirmação + Consulta)" },
  { id: "calendario-menu", rotulo: "Agenda" },
  { id: "pontos-alterar-outros", rotulo: "Banco de Horas — pode alterar registros de outros" },
  { id: "pontos-editar-feriados", rotulo: "Banco de Horas — pode editar feriados" },
];

function lerSetoresPermissoes() {
  return JSON.parse(localStorage.getItem(CHAVE_SETORES_PERMISSOES)) || {};
}
// Antes salvava no navegador e mandava pro servidor "em silêncio": se o
// servidor recusasse (conta sem acesso de administrador), a tela dizia
// que salvou e mostrava "Acesso total", mas nada tinha mudado de verdade.
// Agora, se o servidor recusar, avisa e desfaz no navegador.
async function salvarSetoresPermissoes(mapa) {
  const anterior = localStorage.getItem(CHAVE_SETORES_PERMISSOES);
  localStorage.setItem(CHAVE_SETORES_PERMISSOES, JSON.stringify(mapa));
  let r;
  try { r = await apiDataSet("setoresPermissoes", mapa); } catch (e) { r = { ok: false, erro: "Sem conexão com o servidor." }; }
  if (!r || !r.ok) {
    if (anterior !== null) localStorage.setItem(CHAVE_SETORES_PERMISSOES, anterior);
    else localStorage.removeItem(CHAVE_SETORES_PERMISSOES);
    const msg = (r && r.erro) || "Não foi possível salvar as permissões.";
    if (typeof mostrarToast === "function") mostrarToast(`Permissões NÃO salvas: ${msg}`, "erro");
    return false;
  }
  return true;
}

function getPermissoesDoSetor(nomeSetor) {
  const mapa = lerSetoresPermissoes();
  return mapa[nomeSetor] || [];
}

function salvarPermissoesDoSetor(nomeSetor, idsPermitidos) {
  const mapa = lerSetoresPermissoes();
  mapa[nomeSetor] = idsPermitidos;
  return salvarSetoresPermissoes(mapa);
}

// Renomear ou excluir um setor também deve atualizar o mapa de
// permissões, para não deixar "lixo" órfão.
function renomearSetorNasPermissoes(nomeAntigo, nomeNovo) {
  const mapa = lerSetoresPermissoes();
  if (mapa[nomeAntigo] !== undefined) {
    mapa[nomeNovo] = mapa[nomeAntigo];
    delete mapa[nomeAntigo];
    salvarSetoresPermissoes(mapa);
  }
}
function excluirSetorDasPermissoes(nomeSetor) {
  const mapa = lerSetoresPermissoes();
  delete mapa[nomeSetor];
  salvarSetoresPermissoes(mapa);
}

// Setores com acesso total fixo (mesma regra do Worker): Diretoria e
// Supervisor TI. Não dependem das permissões marcadas no setor.
// Além desses, qualquer setor com a caixinha "Acesso total ao site"
// marcada (permissão "acesso-total-admin") — o Worker usa a mesma regra.
const PERMISSAO_ACESSO_TOTAL = "acesso-total-admin";
function ehSetorAdministradorFixo(setor) {
  const s = String(setor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
  return s === "DIRETORIA" || s === "SUPERVISOR TI";
}
function ehSetorAdministradorLocal(setor) {
  if (ehSetorAdministradorFixo(setor)) return true;
  try { return getPermissoesDoSetor(setor).includes(PERMISSAO_ACESSO_TOTAL); } catch (e) { return false; }
}

// ====================================================
// SINCRONIZAÇÃO COM O SERVIDOR (Worker + KV)
// ====================================================
// "setores" e "setoresPermissoes" vivem no servidor agora, para que
// todo mundo (em qualquer computador) veja os mesmos dados. O
// localStorage aqui funciona só como CACHE LOCAL de leitura rápida —
// toda função de escrita abaixo também empurra a mudança pro
// servidor (apiDataSet). Chame sincronizarDadosCompartilhados() e
// espere (await) ela terminar antes de usar getPermissoesDoSetor()
// ou os setores, em qualquer página que acabou de carregar.
async function sincronizarDadosCompartilhados() {
  try {
    const [respSetores, respPermissoes] = await Promise.all([
      apiDataGet("setores"),
      apiDataGet("setoresPermissoes"),
    ]);
    if (respSetores.ok && respSetores.valor) {
      localStorage.setItem("setores", JSON.stringify(respSetores.valor));
    }
    if (respPermissoes.ok && respPermissoes.valor) {
      localStorage.setItem(CHAVE_SETORES_PERMISSOES, JSON.stringify(respPermissoes.valor));
    }
  } catch (e) {
    console.warn("[permissoes-setor.js] Não foi possível sincronizar com o servidor, usando cache local.", e);
  }
}

// Cria a configuração padrão de setores/permissões no SERVIDOR.
// Só deve ser chamada por um admin (a partir de gerenciarcontas.html)
// e só faz algo se ainda não existir nada configurado no servidor.
async function seedPermissoesPadraoSeVazio() {
  const respPermissoes = await apiDataGet("setoresPermissoes");
  if (respPermissoes.ok && respPermissoes.valor) return; // já existe, não sobrescreve

  const todos = ITENS_MENU_DISPONIVEIS.map((i) => i.id);
  const todosMenosCadastro = todos.filter((id) => id !== "gerenciarcontas-menu");

  const configuracaoInicial = {
    "TI": todos,
    "Outro": todos,
    "Financeiro": todosMenosCadastro,
    "Comercial": ["quadros-menu", "obras-menu", "reuniao-menu", "midias-menu", "pontos-menu", "calendario-menu"],
    "Recursos Humanos": ["quadros-menu", "notas-menu", "reuniao-menu", "midias-menu", "calendario-menu"],
  };

  const respSetores = await apiDataGet("setores");
  const setores = (respSetores.ok && respSetores.valor) ? respSetores.valor : [];
  Object.keys(configuracaoInicial).forEach((nome) => {
    if (!setores.includes(nome)) setores.push(nome);
  });

  await apiDataSet("setoresPermissoes", configuracaoInicial);
  await apiDataSet("setores", setores);
  await sincronizarDadosCompartilhados();
}