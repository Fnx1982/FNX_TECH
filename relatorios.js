// ============================================================
// relatorios.js
// Lê dados já existentes do Folha da Equipe e do
// Extrato Bancário (qualquer um dos 3 bancos) direto do
// servidor (nuvem), aplica os filtros configurados, e gera um PDF
// com jsPDF + autotable. Guarda um histórico de configurações
// salvas, que podem ser reabertas e editadas (o que regenera
// o PDF) ou excluídas.
// ============================================================

const CHAVE_RELATORIOS = "relatorios_salvos";

// Contas do Gerenciamento de Contas (FNX DEV). Preenchido no início
// (carregarContasRelatorio), com os lançamentos que estão no servidor.
const BANCOS = {}; // { idConta: { nome } }
let _lancamentosExtratoRelatorio = [];
let _extratoConfigRelatorio = {};
async function carregarContasRelatorio() {
  try {
    const [rc, rl, rcfg] = await Promise.all([apiDataGet("contasBancarias"), apiListarLancamentosExtrato(), apiDataGet("extratoConfig")]);
    (rc.ok && Array.isArray(rc.valor) ? rc.valor : []).forEach((c) => { BANCOS[c.id] = { nome: c.nome }; });
    _lancamentosExtratoRelatorio = rl.ok ? rl.lancamentos || [] : [];
    _extratoConfigRelatorio = rcfg.ok && rcfg.valor ? rcfg.valor : {};
  } catch (e) { console.warn("[relatorios] contas não carregadas", e); }
}
const _contasRelatorioPronto = carregarContasRelatorio();

// ====================================================
// ELEMENTOS
// ====================================================
const listaRelatorios = document.getElementById("listaRelatorios");
const semRelatorios = document.getElementById("semRelatorios");
const btnNovoRelatorio = document.getElementById("btnNovoRelatorio");

const modalRelatorio = document.getElementById("modalRelatorio");
const tituloModalRelatorio = document.getElementById("tituloModalRelatorio");
const fecharModalRelatorio = document.getElementById("fecharModalRelatorio");
const btnCancelarRelatorio = document.getElementById("btnCancelarRelatorio");
const btnSalvarRelatorio = document.getElementById("btnSalvarRelatorio");
const nomeRelatorioInput = document.getElementById("nomeRelatorio");

const btnTipoFuncionarios = document.getElementById("btnTipoFuncionarios");
const btnTipoExtrato = document.getElementById("btnTipoExtrato");
const btnTipoMateriais = document.getElementById("btnTipoMateriais");
const btnTipoObras = document.getElementById("btnTipoObras");
const btnTipoCombinado = document.getElementById("btnTipoCombinado");
const btnTipoApresentacao = document.getElementById("btnTipoApresentacao");
const btnGerarApresentacao = document.getElementById("btnGerarApresentacaoDemanda"); // compatibilidade
const btnGerarApresentacaoDemanda = document.getElementById("btnGerarApresentacaoDemanda");
const btnGerarApresentacaoFinanceiro = document.getElementById("btnGerarApresentacaoFinanceiro");
const secaoFuncionarios = document.getElementById("secaoFuncionarios");
const secaoExtrato = document.getElementById("secaoExtrato");
const secaoMateriais = document.getElementById("secaoMateriais");
const secaoObras = document.getElementById("secaoObras");

const bancosExtratoSel = new Set(); // vazio = nenhum banco ainda (obrigatório escolher ao menos um)
const tipoLancamentoExtratoSelect = document.getElementById("tipoLancamentoExtrato");

// ====================================================
// ESTADO
// ====================================================
let relatorios = [];

// ── Dados que vêm da NUVEM (antes eram lidos do navegador e os
// relatórios saíam vazios em outro computador) ──
let _cacheRel = { funcionarios: [], obrasFinanceiro: [], materiais: [], setoresMaterial: [], obras: [], boletos: [] };
async function carregarDadosRelatorio() {
  const [fin, rMat, rSet, rBol, rRel] = await Promise.all([
    carregarFinanceiroFunc().catch(() => ({ obras: [], funcionarios: [] })),
    apiListarMateriais().catch(() => ({ ok: false })),
    apiDataGet("materiaisSetores").catch(() => ({ ok: false })),
    apiListarBoletos().catch(() => ({ ok: false })),
    apiDataGet("relatoriosSalvos").catch(() => ({ ok: false })),
    typeof carregarObrasCache === "function" ? carregarObrasCache().catch(() => {}) : null,
  ]);
  _cacheRel.funcionarios = (fin && fin.funcionarios) || [];
  _cacheRel.obrasFinanceiro = (fin && fin.obras) || [];
  _cacheRel.materiais = (rMat.ok ? rMat.materiais || [] : []).map((m) => ({
    ...m, nome: String(m.nome || ""), setor: m.setor || "Sem setor", codigo: String(m.codigo || ""),
    valor: Number(m.valor) || 0, quantidade: Number(m.quantidade) || 0, observacao: m.observacao || "" }));
  _cacheRel.setoresMaterial = rSet.ok && Array.isArray(rSet.valor) ? rSet.valor : [];
  if (_cacheRel.materiais.some((m) => m.setor === "Sem setor") && !_cacheRel.setoresMaterial.includes("Sem setor")) _cacheRel.setoresMaterial.push("Sem setor");
  _cacheRel.boletos = rBol.ok ? rBol.boletos || [] : [];
  if (rRel.ok && Array.isArray(rRel.valor)) relatorios = rRel.valor;
  else {
    // primeira vez: sobe o histórico que estava só neste navegador
    try { relatorios = JSON.parse(localStorage.getItem(CHAVE_RELATORIOS)) || []; } catch (e) { relatorios = []; }
    if (relatorios.length) apiDataSet("relatoriosSalvos", relatorios);
  }
}
const _dadosRelatorioPronto = carregarDadosRelatorio();
let idEditando = null; // id do relatório sendo editado, ou null se for novo
let tipoSelecionado = "funcionarios";

let mesesFuncSel = new Set();
let obrasFuncSel = new Set();
let nomesFuncSel = new Set();
let classificacoesExtratoSel = new Set();
let setoresMaterialSel = new Set();
let obrasRelatorioSel = new Set(); // vazio = todas as obras

// ====================================================
// LEITURA DOS DADOS EXISTENTES (Funcionários / Extrato)
// ====================================================
function lerFuncionarios() { return _cacheRel.funcionarios; }
function lerObrasFinanceiro() { return _cacheRel.obrasFinanceiro; }
function lerExtrato(bancoKey) {
  if (!BANCOS[bancoKey]) return { lancamentos: [], classificacoes: [] };
  return {
    lancamentos: _lancamentosExtratoRelatorio.filter((l) => l.banco === bancoKey),
    classificacoes: (_extratoConfigRelatorio[bancoKey] && _extratoConfigRelatorio[bancoKey].classificacoes) || [],
  };
}
function lerMateriais() { return _cacheRel.materiais; }
function lerSetoresMaterial() { return _cacheRel.setoresMaterial; }

// ====================================================
// MODAL — abrir / fechar
// ====================================================
function abrirModal() {
  modalRelatorio.classList.add("active");
}
function fecharModal() {
  modalRelatorio.classList.remove("active");
}

btnNovoRelatorio.addEventListener("click", () => {
  idEditando = null;
  nomeRelatorioInput.value = "";
  mesesFuncSel.clear();
  obrasFuncSel.clear();
  nomesFuncSel.clear();
  classificacoesExtratoSel.clear();
  bancosExtratoSel.clear();
  tipoLancamentoExtratoSelect.value = "todos";
  setoresMaterialSel.clear();
  buscaMaterialInput.value = "";
  obrasRelatorioSel.clear();
  definirTipo("funcionarios");
  tituloModalRelatorio.textContent = "Novo Relatório";
  btnSalvarRelatorio.textContent = "Salvar e Gerar PDF";
  atualizarOpcoesMultiSelect();
  abrirModal();
});

fecharModalRelatorio.addEventListener("click", fecharModal);
btnCancelarRelatorio.addEventListener("click", fecharModal);
modalRelatorio.addEventListener("click", (e) => {
  if (e.target === modalRelatorio) fecharModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModal();
});

// ====================================================
// TOGGLE DE TIPO (Funcionários / Extrato / Combinado)
// ====================================================
function definirTipo(tipo) {
  tipoSelecionado = tipo;
  [btnTipoFuncionarios, btnTipoExtrato, btnTipoMateriais, btnTipoObras, btnTipoCombinado, btnTipoApresentacao].forEach((b) => b && b.classList.remove("active"));
  if (tipo === "funcionarios") btnTipoFuncionarios.classList.add("active");
  if (tipo === "extrato") btnTipoExtrato.classList.add("active");
  if (tipo === "materiais") btnTipoMateriais.classList.add("active");
  if (tipo === "obras") btnTipoObras.classList.add("active");
  if (tipo === "combinado") btnTipoCombinado.classList.add("active");
  if (tipo === "apresentacao") btnTipoApresentacao.classList.add("active");

  secaoFuncionarios.style.display = tipo === "funcionarios" || tipo === "combinado" ? "block" : "none";
  secaoExtrato.style.display = tipo === "extrato" || tipo === "combinado" ? "block" : "none";
  secaoMateriais.style.display = tipo === "materiais" ? "block" : "none";
  secaoObras.style.display = tipo === "obras" ? "block" : "none";

  const secApres = document.getElementById("secaoApresentacao");
  if (secApres) secApres.style.display = tipo === "apresentacao" ? "block" : "none";

  // Troca os botões do rodapé conforme o tipo
  if (btnSalvarRelatorio) btnSalvarRelatorio.style.display = tipo === "apresentacao" ? "none" : "inline-block";
  if (btnGerarApresentacaoDemanda) btnGerarApresentacaoDemanda.style.display = tipo === "apresentacao" ? "inline-block" : "none";
  if (btnGerarApresentacaoFinanceiro) btnGerarApresentacaoFinanceiro.style.display = tipo === "apresentacao" ? "inline-block" : "none";
  if (tipo === "apresentacao") { inicializarGridMeses(); }
}
btnTipoFuncionarios.addEventListener("click", () => definirTipo("funcionarios"));
btnTipoExtrato.addEventListener("click", () => definirTipo("extrato"));
btnTipoMateriais.addEventListener("click", () => definirTipo("materiais"));
btnTipoObras.addEventListener("click", () => definirTipo("obras"));
btnTipoCombinado.addEventListener("click", () => definirTipo("combinado"));
btnTipoApresentacao.addEventListener("click", () => definirTipo("apresentacao"));

// ====================================================
// MULTI-SELECT GENÉRICO (reaproveitado)
// ====================================================
function configurarMultiSelect({ painel, toggle, container, resumoEl, getOpcoes, selecionados, labelTodos, onChange, rotulo }) {
  const obterRotulo = rotulo || ((valor) => valor);

  function renderPainel() {
    const opcoes = getOpcoes();
    painel.innerHTML = "";
    if (opcoes.length === 0) {
      painel.innerHTML = '<div class="multi-select-vazio">Nenhuma opção disponível.</div>';
      return;
    }
    opcoes.forEach((opcao) => {
      const linha = document.createElement("label");
      linha.className = "multi-select-opcao";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selecionados.has(opcao);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selecionados.add(opcao);
        else selecionados.delete(opcao);
        atualizarResumo();
        if (onChange) onChange();
      });
      linha.appendChild(checkbox);
      linha.appendChild(document.createTextNode(obterRotulo(opcao)));
      painel.appendChild(linha);
    });

    const acoes = document.createElement("div");
    acoes.className = "multi-select-acoes";
    const btnTodos = document.createElement("button");
    btnTodos.type = "button";
    btnTodos.textContent = "Todos";
    btnTodos.addEventListener("click", () => {
      opcoes.forEach((o) => selecionados.add(o));
      renderPainel();
      atualizarResumo();
      if (onChange) onChange();
    });
    const btnLimpar = document.createElement("button");
    btnLimpar.type = "button";
    btnLimpar.textContent = "Limpar";
    btnLimpar.addEventListener("click", () => {
      selecionados.clear();
      renderPainel();
      atualizarResumo();
      if (onChange) onChange();
    });
    acoes.appendChild(btnTodos);
    acoes.appendChild(btnLimpar);
    painel.appendChild(acoes);
  }

  function atualizarResumo() {
    if (selecionados.size === 0) resumoEl.textContent = labelTodos;
    else if (selecionados.size === 1) resumoEl.textContent = obterRotulo([...selecionados][0]);
    else resumoEl.textContent = `${selecionados.size} selecionados`;
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const estavaAberto = container.classList.contains("open");
    document.querySelectorAll(".multi-select.open").forEach((el) => el.classList.remove("open"));
    if (!estavaAberto) {
      renderPainel();
      container.classList.add("open");
    }
  });
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) container.classList.remove("open");
  });

  atualizarResumo();
  return { renderPainel, atualizarResumo };
}

const msMesFunc = configurarMultiSelect({
  painel: document.getElementById("painelMesFunc"),
  toggle: document.getElementById("toggleMesFunc"),
  container: document.getElementById("multiMesFunc"),
  resumoEl: document.getElementById("resumoMesFunc"),
  getOpcoes: () => ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
  selecionados: mesesFuncSel,
  labelTodos: "Todos",
});

const msObraFunc = configurarMultiSelect({
  painel: document.getElementById("painelObraFunc"),
  toggle: document.getElementById("toggleObraFunc"),
  container: document.getElementById("multiObraFunc"),
  resumoEl: document.getElementById("resumoObraFunc"),
  getOpcoes: () => lerObrasFinanceiro(),
  selecionados: obrasFuncSel,
  labelTodos: "Todas",
});

const msNomeFunc = configurarMultiSelect({
  painel: document.getElementById("painelNomeFunc"),
  toggle: document.getElementById("toggleNomeFunc"),
  container: document.getElementById("multiNomeFunc"),
  resumoEl: document.getElementById("resumoNomeFunc"),
  getOpcoes: () => [...new Set(lerFuncionarios().map((f) => f.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  selecionados: nomesFuncSel,
  labelTodos: "Todos",
});

const msBancoExtrato = configurarMultiSelect({
  painel: document.getElementById("painelBancoExtrato"),
  toggle: document.getElementById("toggleBancoExtrato"),
  container: document.getElementById("multiBancoExtrato"),
  resumoEl: document.getElementById("resumoBancoExtrato"),
  getOpcoes: () => Object.keys(BANCOS), // ids das contas cadastradas
  rotulo: (key) => BANCOS[key].nome,
  selecionados: bancosExtratoSel,
  labelTodos: "Selecione",
  onChange: () => {
    classificacoesExtratoSel.clear();
    msClassificacaoExtrato.atualizarResumo();
  },
});

const msClassificacaoExtrato = configurarMultiSelect({
  painel: document.getElementById("painelClassificacaoExtrato"),
  toggle: document.getElementById("toggleClassificacaoExtrato"),
  container: document.getElementById("multiClassificacaoExtrato"),
  resumoEl: document.getElementById("resumoClassificacaoExtrato"),
  getOpcoes: () => {
    // Junta (sem repetir) as classificações de todos os bancos selecionados.
    const todasClassificacoes = new Set();
    bancosExtratoSel.forEach((key) => {
      lerExtrato(key).classificacoes.forEach((c) => todasClassificacoes.add(c));
    });
    return [...todasClassificacoes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  },
  selecionados: classificacoesExtratoSel,
  labelTodos: "Todas",
});

const msSetorMaterial = configurarMultiSelect({
  painel: document.getElementById("painelSetorMaterial"),
  toggle: document.getElementById("toggleSetorMaterial"),
  container: document.getElementById("multiSetorMaterial"),
  resumoEl: document.getElementById("resumoSetorMaterial"),
  getOpcoes: () => lerSetoresMaterial(),
  selecionados: setoresMaterialSel,
  labelTodos: "Todos",
});

const buscaMaterialInput = document.getElementById("buscaMaterial");

const msObrasRelatorio = configurarMultiSelect({
  painel: document.getElementById("painelObrasRelatorio"),
  toggle: document.getElementById("toggleObrasRelatorio"),
  container: document.getElementById("multiObrasRelatorio"),
  resumoEl: document.getElementById("resumoObrasRelatorio"),
  getOpcoes: () => lerObras().map((o) => o.id),
  rotulo: (id) => {
    const obra = buscarObra(id);
    if (!obra) return id;
    return `${obra.cliente || "(sem cliente)"} — ${obra.servico || ""}`.trim();
  },
  selecionados: obrasRelatorioSel,
  labelTodos: "Todas",
});

function atualizarOpcoesMultiSelect() {
  // Força reconstrução das opções (ex: obras/classificações podem ter mudado)
  msMesFunc.atualizarResumo();
  msObraFunc.atualizarResumo();
  msNomeFunc.atualizarResumo();
  msBancoExtrato.atualizarResumo();
  msClassificacaoExtrato.atualizarResumo();
  msSetorMaterial.atualizarResumo();
  msObrasRelatorio.atualizarResumo();
}

// ====================================================
// SALVAR CONFIGURAÇÃO DO RELATÓRIO (histórico)
// ====================================================
function salvarRelatorios() {
  // Histórico de relatórios fica na nuvem (todo mundo vê o mesmo)
  apiDataSet("relatoriosSalvos", relatorios).then((r) => {
    if (!r || !r.ok) mostrarToast("Não foi possível salvar o histórico na nuvem.", "erro");
  });
}

btnSalvarRelatorio.addEventListener("click", () => {
  limparErrosDoFormulario(modalRelatorio);

  const nome = nomeRelatorioInput.value.trim();
  let temErro = false;

  if (!nome) {
    marcarCampoComErro(nomeRelatorioInput, "Dê um nome para o relatório.");
    temErro = true;
  }

  if ((tipoSelecionado === "extrato" || tipoSelecionado === "combinado") && bancosExtratoSel.size === 0) {
    marcarCampoComErro(document.getElementById("toggleBancoExtrato"), "Selecione ao menos um banco.");
    temErro = true;
  }

  if (temErro) {
    focarPrimeiroErro(modalRelatorio);
    return;
  }

  const config = {
    id: idEditando || `rel_${Date.now()}`,
    nome,
    tipo: tipoSelecionado,
    criadoEm: idEditando ? buscarRelatorio(idEditando).criadoEm : new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    filtrosFuncionarios: {
      meses: [...mesesFuncSel],
      obras: [...obrasFuncSel],
      nomes: [...nomesFuncSel],
    },
    filtrosExtrato: {
      bancos: [...bancosExtratoSel],
      tipoLancamento: tipoLancamentoExtratoSelect.value,
      classificacoes: [...classificacoesExtratoSel],
    },
    filtrosMateriais: {
      setores: [...setoresMaterialSel],
      busca: buscaMaterialInput.value.trim(),
    },
    filtrosObras: {
      obraIds: [...obrasRelatorioSel],
    },
  };

  if (idEditando) {
    const idx = relatorios.findIndex((r) => r.id === idEditando);
    if (idx !== -1) relatorios[idx] = config;
  } else {
    relatorios.push(config);
  }

  salvarRelatorios();
  fecharModal();
  renderListaRelatorios();
  gerarPDF(config);
});

function buscarRelatorio(id) {
  return relatorios.find((r) => r.id === id);
}

// ====================================================
// EDITAR / EXCLUIR
// ====================================================
function editarRelatorio(id) {
  const r = buscarRelatorio(id);
  if (!r) return;

  idEditando = id;
  nomeRelatorioInput.value = r.nome;
  definirTipo(r.tipo);

  // IMPORTANTE: mutamos os Sets existentes (clear + add) em vez de
  // reatribuir com "new Set(...)" — os componentes multi-select foram
  // configurados apontando para essas instâncias específicas, então
  // trocar a referência faria os checkboxes pararem de refletir o
  // estado real.
  mesesFuncSel.clear();
  r.filtrosFuncionarios.meses.forEach((m) => mesesFuncSel.add(m));

  obrasFuncSel.clear();
  r.filtrosFuncionarios.obras.forEach((o) => obrasFuncSel.add(o));

  nomesFuncSel.clear();
  r.filtrosFuncionarios.nomes.forEach((n) => nomesFuncSel.add(n));

  bancosExtratoSel.clear();
  // Retrocompatibilidade: relatórios salvos antes desta atualização
  // guardavam um único "banco" (string). Os novos guardam "bancos" (array).
  if (Array.isArray(r.filtrosExtrato.bancos)) {
    r.filtrosExtrato.bancos.forEach((b) => bancosExtratoSel.add(b));
  } else if (r.filtrosExtrato.banco) {
    bancosExtratoSel.add(r.filtrosExtrato.banco);
  }
  tipoLancamentoExtratoSelect.value = r.filtrosExtrato.tipoLancamento;

  classificacoesExtratoSel.clear();
  r.filtrosExtrato.classificacoes.forEach((c) => classificacoesExtratoSel.add(c));

  setoresMaterialSel.clear();
  // Retrocompatibilidade: relatórios salvos antes de Materiais existir
  // não têm filtrosMateriais.
  if (r.filtrosMateriais) {
    r.filtrosMateriais.setores.forEach((s) => setoresMaterialSel.add(s));
    buscaMaterialInput.value = r.filtrosMateriais.busca || "";
  } else {
    buscaMaterialInput.value = "";
  }

  obrasRelatorioSel.clear();
  // Retrocompatibilidade: relatórios salvos antes de Obras existir
  // não têm filtrosObras.
  if (r.filtrosObras) {
    r.filtrosObras.obraIds.forEach((id) => obrasRelatorioSel.add(id));
  }

  atualizarOpcoesMultiSelect();

  tituloModalRelatorio.textContent = "Editar Relatório";
  btnSalvarRelatorio.textContent = "Salvar Alterações e Gerar PDF";
  abrirModal();
}

async function excluirRelatorio(id) {
  const r = buscarRelatorio(id);
  if (!r) return;
  const confirmado = await confirmarAcao(
    `Excluir o relatório "${r.nome}"?`,
    "Essa ação não pode ser desfeita."
  );
  if (!confirmado) return;
  relatorios = relatorios.filter((rel) => rel.id !== id);
  salvarRelatorios();
  renderListaRelatorios();
}

function baixarPdfDeNovo(id) {
  const r = buscarRelatorio(id);
  if (!r) return;
  gerarPDF(r);
}

// ====================================================
// RENDER DA LISTA DE RELATÓRIOS SALVOS
// ====================================================
function formatarDataHora(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function rotuloTipo(tipo) {
  if (tipo === "funcionarios") return "Funcionários";
  if (tipo === "extrato") return "Extrato";
  if (tipo === "materiais") return "Produtos";
  if (tipo === "obras") return "Projetos";
  return "Combinado";
}

function renderListaRelatorios() {
  listaRelatorios.innerHTML = "";

  if (relatorios.length === 0) {
    semRelatorios.style.display = "block";
    return;
  }
  semRelatorios.style.display = "none";

  const ordenados = [...relatorios].sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));

  ordenados.forEach((r) => {
    const card = document.createElement("div");
    card.className = "relatorio-card";

    const bancosKeys = Array.isArray(r.filtrosExtrato.bancos)
      ? r.filtrosExtrato.bancos
      : (r.filtrosExtrato.banco ? [r.filtrosExtrato.banco] : []);
    const bancosNomes = bancosKeys.filter((k) => BANCOS[k]).map((k) => BANCOS[k].nome).join(", ");

    card.innerHTML = `
      <div class="relatorio-info">
        <div class="relatorio-nome">${escaparHtml(r.nome)}</div>
        <div class="relatorio-meta">
          <span class="tag-tipo ${r.tipo}">${rotuloTipo(r.tipo)}</span>
          ${ (r.tipo === "extrato" || r.tipo === "combinado") && bancosNomes ? `<span>Conta(s): ${escaparHtml(bancosNomes)}</span>` : "" }
          <span>Atualizado em ${formatarDataHora(r.atualizadoEm)}</span>
        </div>
      </div>
      <div class="relatorio-acoes">
        <button class="btn-pdf" data-pdf-id="${r.id}">Baixar PDF</button>
        <button class="btn-editar" data-edit-id="${r.id}">Editar</button>
        <button class="btn-excluir-item" data-delete-id="${r.id}">Excluir</button>
      </div>
    `;
    listaRelatorios.appendChild(card);
  });

  listaRelatorios.querySelectorAll("[data-pdf-id]").forEach((btn) => {
    btn.addEventListener("click", () => baixarPdfDeNovo(btn.dataset.pdfId));
  });
  listaRelatorios.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => editarRelatorio(btn.dataset.editId));
  });
  listaRelatorios.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", () => excluirRelatorio(btn.dataset.deleteId));
  });
}

// ====================================================
// GERAÇÃO DO PDF
// ====================================================
function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatarDataBR(isoDate) {
  if (!isoDate) return "";
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}

function filtrarFuncionarios(config) {
  const { meses, obras, nomes } = config.filtrosFuncionarios;
  return lerFuncionarios().filter((f) => {
    const mesOK = meses.length === 0 || meses.includes(f.mes);
    const obraOK = obras.length === 0 || obras.includes(f.obra);
    const nomeOK = nomes.length === 0 || nomes.includes(f.nome);
    return mesOK && obraOK && nomeOK;
  });
}

function filtrarExtrato(config) {
  const { bancos, tipoLancamento, classificacoes } = config.filtrosExtrato;

  // Para cada banco selecionado, filtra seus lançamentos separadamente —
  // o resultado é uma lista de blocos (um por banco), preservando bancos
  // distintos em tabelas distintas no PDF.
  return bancos.map((bancoKey) => {
    const dados = lerExtrato(bancoKey);
    const itens = dados.lancamentos.filter((l) => {
      const tipoOK = tipoLancamento === "todos" || l.tipo === tipoLancamento;
      const classOK = classificacoes.length === 0 || classificacoes.includes(l.classificacao);
      return tipoOK && classOK;
    });
    return {
      bancoKey,
      bancoNome: BANCOS[bancoKey] ? BANCOS[bancoKey].nome : bancoKey,
      itens,
    };
  });
}

function gerarPDF(config) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margemEsquerda = 40;
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(config.nome, margemEsquerda, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margemEsquerda, y);
  doc.setTextColor(0);
  y += 24;

  if (config.tipo === "funcionarios" || config.tipo === "combinado") {
    y = secaoFuncionariosPDF(doc, config, y, margemEsquerda);
  }
  if (config.tipo === "extrato" || config.tipo === "combinado") {
    y = secaoExtratoPDF(doc, config, y, margemEsquerda);
  }
  if (config.tipo === "materiais") {
    y = secaoMateriaisPDF(doc, config, y, margemEsquerda);
  }
  if (config.tipo === "obras") {
    y = secaoObrasPDF(doc, config, y, margemEsquerda);
  }

  const nomeArquivo = config.nome.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "relatorio";
  doc.save(`${nomeArquivo}.pdf`);
}

function garantirEspaco(doc, y, minimo) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  if (y + minimo > alturaPagina - 40) {
    doc.addPage();
    return 50;
  }
  return y;
}

function secaoFuncionariosPDF(doc, config, y, margemEsquerda) {
  y = garantirEspaco(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Folha da Equipe", margemEsquerda, y);
  y += 16;

  const itens = filtrarFuncionarios(config);

  if (itens.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Nenhum lançamento encontrado com os filtros selecionados.", margemEsquerda, y);
    return y + 20;
  }

  const linhas = itens.map((f) => [
    f.nome,
    f.obra,
    f.mes,
    `R$ ${formatarMoeda(parseFloat(f.valor))}`,
  ]);

  const total = itens.reduce((soma, f) => soma + parseFloat(f.valor || 0), 0);

  doc.autoTable({
    startY: y,
    head: [["Funcionário", "Projeto", "Mês", "Valor"]],
    body: linhas,
    margin: { left: margemEsquerda, right: margemEsquerda },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [255, 106, 0] },
    foot: [["", "", "Total", `R$ ${formatarMoeda(total)}`]],
    footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  return doc.lastAutoTable.finalY + 24;
}

function secaoExtratoPDF(doc, config, y, margemEsquerda) {
  const blocosBanco = filtrarExtrato(config);

  blocosBanco.forEach((bloco) => {
    y = garantirEspaco(doc, y, 60);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Extrato Bancário — ${bloco.bancoNome}`, margemEsquerda, y);
    y += 16;

    if (bloco.itens.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Nenhum lançamento encontrado com os filtros selecionados.", margemEsquerda, y);
      y += 24;
      return;
    }

    const ordenados = [...bloco.itens].sort((a, b) => new Date(a.data) - new Date(b.data));

    const linhas = ordenados.map((l) => [
      formatarDataBR(l.data),
      l.descricao,
      l.classificacao,
      l.tipo === "entrada" ? "Entrada" : "Saída",
      `${l.tipo === "entrada" ? "+" : "-"} R$ ${formatarMoeda(l.valor)}`,
    ]);

    const totalEntradas = ordenados.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
    const totalSaidas = ordenados.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
    const saldo = totalEntradas - totalSaidas;

    doc.autoTable({
      startY: y,
      head: [["Data", "Descrição", "Classificação", "Tipo", "Valor"]],
      body: linhas,
      margin: { left: margemEsquerda, right: margemEsquerda },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [28, 138, 75] },
      foot: [
        ["", "", "", "Entradas", `R$ ${formatarMoeda(totalEntradas)}`],
        ["", "", "", "Saídas", `R$ ${formatarMoeda(totalSaidas)}`],
        ["", "", "", "Saldo", `R$ ${formatarMoeda(saldo)}`],
      ],
      footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
    });

    y = doc.lastAutoTable.finalY + 24;
  });

  return y;
}

function filtrarMateriais(config) {
  const { setores, busca } = config.filtrosMateriais;
  const termo = (busca || "").trim().toLowerCase();

  return lerMateriais().filter((m) => {
    const setorOK = setores.length === 0 || setores.includes(m.setor);
    const buscaOK =
      termo === "" ||
      m.nome.toLowerCase().includes(termo) ||
      m.codigo.toLowerCase().includes(termo) ||
      (m.observacao || "").toLowerCase().includes(termo);
    return setorOK && buscaOK;
  });
}

function secaoMateriaisPDF(doc, config, y, margemEsquerda) {
  y = garantirEspaco(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Catálogo de Produtos", margemEsquerda, y);
  y += 16;

  const itens = filtrarMateriais(config);

  if (itens.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Nenhum produto encontrado com os filtros selecionados.", margemEsquerda, y);
    return y + 20;
  }

  const ordenados = [...itens].sort((a, b) => a.setor.localeCompare(b.setor, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

  const linhas = ordenados.map((m) => [
    m.nome,
    m.setor,
    m.codigo,
    `R$ ${formatarMoeda(m.valor)}`,
    String(m.quantidade),
    `R$ ${formatarMoeda(m.valor * m.quantidade)}`,
  ]);

  const totalQuantidade = ordenados.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const totalValor = ordenados.reduce((s, m) => s + m.valor * m.quantidade, 0);

  doc.autoTable({
    startY: y,
    head: [["Produto", "Setor", "Código", "Valor Unit.", "Qtd.", "Subtotal"]],
    body: linhas,
    margin: { left: margemEsquerda, right: margemEsquerda },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [43, 108, 176] },
    foot: [["", "", "", "", "Total", `R$ ${formatarMoeda(totalValor)} (${totalQuantidade} itens)`]],
    footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  return doc.lastAutoTable.finalY + 24;
}

function obrasFiltradas(config) {
  const { obraIds } = config.filtrosObras;
  const todas = lerObras();
  if (obraIds.length === 0) return todas;
  return todas.filter((o) => obraIds.includes(o.id));
}

function secaoObrasPDF(doc, config, y, margemEsquerda) {
  const obras = obrasFiltradas(config);

  if (obras.length === 0) {
    y = garantirEspaco(doc, y, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Nenhum projeto encontrado com os filtros selecionados.", margemEsquerda, y);
    return y + 20;
  }

  obras.forEach((obra, indice) => {
    y = garantirEspaco(doc, y, 100);

    // ----- Cabeçalho da obra -----
    doc.setFillColor(235, 153, 28);
    doc.rect(margemEsquerda, y, doc.internal.pageSize.getWidth() - margemEsquerda * 2, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`${obra.cliente || "(sem cliente)"} — ${obra.servico || ""}`, margemEsquerda + 8, y + 15);
    doc.setTextColor(0, 0, 0);
    y += 32;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Criada em ${new Date(obra.criadoEm).toLocaleDateString("pt-BR")}`, margemEsquerda, y);
    y += 14;

    if (obra.observacao) {
      doc.setFont("helvetica", "bold");
      doc.text("Observação:", margemEsquerda, y);
      doc.setFont("helvetica", "normal");
      const linhasObs = doc.splitTextToSize(obra.observacao, doc.internal.pageSize.getWidth() - margemEsquerda * 2 - 70);
      doc.text(linhasObs, margemEsquerda + 65, y);
      y += 13 * linhasObs.length + 6;
    }

    // ----- Tabela: funcionários -----
    y = garantirEspaco(doc, y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Funcionários", margemEsquerda, y);
    y += 6;

    const linhasFunc = obra.funcionarios.map((f) => [
      f.nome,
      `R$ ${formatarMoeda(f.valorCobrado)}`,
      `R$ ${formatarMoeda(f.valorPago)}`,
    ]);

    doc.autoTable({
      startY: y,
      head: [["Funcionário", "Cobrado", "Pago"]],
      body: linhasFunc.length ? linhasFunc : [["Nenhum funcionário", "-", "-"]],
      margin: { left: margemEsquerda, right: margemEsquerda },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [92, 92, 92] },
    });
    y = doc.lastAutoTable.finalY + 14;

    // ----- Tabela: materiais -----
    y = garantirEspaco(doc, y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Produtos anotados", margemEsquerda, y);
    y += 6;

    const linhasMat = obra.materiais.map((m) => [
      m.nome || "-",
      m.codigo || "-",
      `R$ ${formatarMoeda(m.valor)}`,
      m.data ? new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR") : "-",
    ]);

    doc.autoTable({
      startY: y,
      head: [["Produto", "Código", "Valor", "Data"]],
      body: linhasMat.length ? linhasMat : [["Nenhum produto anotado", "-", "-", "-"]],
      margin: { left: margemEsquerda, right: margemEsquerda },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [92, 92, 92] },
    });
    y = doc.lastAutoTable.finalY + 14;

    // ----- Resumo de lucro da obra -----
    y = garantirEspaco(doc, y, 50);
    const lucroMO = lucroMaoDeObraObra(obra);
    const lucroMat = lucroMaterialObra(obra);
    const lucroTot = lucroTotalObra(obra);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Lucro Serviços: R$ ${formatarMoeda(lucroMO)}`, margemEsquerda, y);
    doc.text(`Lucro Produtos: R$ ${formatarMoeda(lucroMat)}`, margemEsquerda + 200, y);
    doc.text(`Lucro Total: R$ ${formatarMoeda(lucroTot)}`, margemEsquerda + 380, y);
    y += 20;

    // Linha divisória entre obras (exceto na última)
    if (indice < obras.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margemEsquerda, y, doc.internal.pageSize.getWidth() - margemEsquerda, y);
      y += 20;
    }
  });

  return y;
}

// ====================================================
// INICIALIZAÇÃO
// ====================================================
limparErroAoEditar(nomeRelatorioInput);

// Popula filtros de mês/ano da apresentação
function inicializarFiltrosApresentacao() {
  const mesEl = document.getElementById("apresentacaoMes");
  const anoEl = document.getElementById("apresentacaoAno");
  if (!mesEl || !anoEl) return;

  const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();

  mesEl.innerHTML = "";
  nomesMeses.forEach((nome, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = nome;
    if (i === mesAtual) opt.selected = true;
    mesEl.appendChild(opt);
  });

  anoEl.innerHTML = "";
  for (let a = anoAtual; a >= anoAtual - 3; a--) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === anoAtual) opt.selected = true;
    anoEl.appendChild(opt);
  }
}
inicializarFiltrosApresentacao();

// Marcar/desmarcar tudo nos slides
const btnMarcarApres = document.getElementById("btnMarcarTudoApresentacao");
const btnDesmarcarApres = document.getElementById("btnDesmarcarTudoApresentacao");
if (btnMarcarApres) btnMarcarApres.addEventListener("click", () => {
  document.querySelectorAll("#checkboxesApresentacao input[type=checkbox]").forEach((cb) => cb.checked = true);
});
if (btnDesmarcarApres) btnDesmarcarApres.addEventListener("click", () => {
  document.querySelectorAll("#checkboxesApresentacao input[type=checkbox]").forEach((cb) => cb.checked = false);
});


// ====================================================
// GRID DE MESES PARA APRESENTAÇÃO
// ====================================================
const NOMES_MESES_GRID = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                           "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function inicializarGridMeses() {
  const grid = document.getElementById("gridMeses");
  if (!grid) return;
  grid.innerHTML = "";
  const mesAtual = new Date().getMonth();
  NOMES_MESES_GRID.forEach((nome, i) => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:6px;padding:7px 10px;background:#F7F7F7;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;";
    label.innerHTML = `<input type="checkbox" data-mes="${i}" ${i <= mesAtual ? "checked" : ""}
      style="width:14px;height:14px;accent-color:#FF6A00;" />${nome.slice(0,3)}`;
    grid.appendChild(label);
  });

  document.getElementById("btnMarcarTodosMeses")?.addEventListener("click", () =>
    grid.querySelectorAll("input").forEach(cb => cb.checked = true));
  document.getElementById("btnDesmarcarTodosMeses")?.addEventListener("click", () =>
    grid.querySelectorAll("input").forEach(cb => cb.checked = false));
}

document.getElementById("apresentacaoAnual")?.addEventListener("change", (e) => {
  const seletor = document.getElementById("seletorMeses");
  if (seletor) seletor.style.display = e.target.checked ? "none" : "block";
});

function getMesesSelecionados() {
  const anual = document.getElementById("apresentacaoAnual")?.checked;
  if (anual) return [0,1,2,3,4,5,6,7,8,9,10,11];
  const grid = document.getElementById("gridMeses");
  if (!grid) return [new Date().getMonth()];
  return [...grid.querySelectorAll("input:checked")].map(cb => parseInt(cb.dataset.mes));
}
function getCheckboxesSelecionados() {
  return [...document.querySelectorAll("#checkboxesApresentacao input[type=checkbox]:checked")].map(cb => cb.value);
}

function getMesAnoApresentacao() {
  return {
    meses: getMesesSelecionados(),
    ano: parseInt(document.getElementById("apresentacaoAno").value),
  };
}

async function executarGeracaoApresentacao(btn, labelOriginal, fn) {
  const selecionados = getCheckboxesSelecionados();
  if (selecionados.length === 0) { mostrarToast("Selecione ao menos um slide.", "erro"); return; }
  const { meses, ano } = getMesAnoApresentacao();
  if (meses.length === 0) { mostrarToast("Selecione ao menos um mês.", "erro"); return; }
  btn.disabled = true;
  btn.textContent = "Gerando...";
  try {
    await fn(meses, ano, selecionados);
    mostrarToast("Apresentação gerada com sucesso!");
  } catch(e) {
    mostrarToast("Erro ao gerar: " + e.message, "erro");
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = labelOriginal;
  }
}

if (btnGerarApresentacaoDemanda) {
  btnGerarApresentacaoDemanda.addEventListener("click", () => {
    executarGeracaoApresentacao(btnGerarApresentacaoDemanda, "📊 Apresentação Comercial",
      (meses, ano, sel) => gerarApresentacaoDemandaPptx(meses, ano, sel));
  });
}

if (btnGerarApresentacaoFinanceiro) {
  btnGerarApresentacaoFinanceiro.addEventListener("click", () => {
    executarGeracaoApresentacao(btnGerarApresentacaoFinanceiro, "📊 Apresentação Financeiro",
      (meses, ano, sel) => gerarApresentacaoFinanceiroPptx(meses, ano, sel));
  });
}

// ====================================================
// HELPERS COMUNS
// ====================================================
function fmtR(v) {
  return "R$ " + (v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtH(h) {
  const s = h < 0 ? "-" : "+";
  const a = Math.abs(h);
  return s + String(Math.floor(a)).padStart(2,"0") + "h" + String(Math.round((a%1)*60)).padStart(2,"0") + "m";
}
const MESES_NOMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                     "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function lerPropostas2() { return typeof lerPropostas === "function" ? lerPropostas() : []; } // nuvem (propostas-core.js)
function lerFinanceiro2() { return financeiroFuncCache.funcionarios || []; } // nuvem (auth-worker.js)
carregarFinanceiroFunc();
function lerObras2()      { return typeof lerObras === "function" ? lerObras() : []; } // nuvem (propostas-core.js)
function lerUsuarios2()   { console.warn("[relatorios.js] lerUsuarios2() está obsoleta — use await lerUsuariosDoServidor()."); return []; }
async function lerUsuariosDoServidor() {
  const r = await apiListarUsuariosBasico();
  return r.ok ? r.usuarios : [];
}
function lerBoletos2()    { return _cacheRel.boletos; } // nuvem

function totalProposta(p) {
  if (typeof totalGeral === "function") return totalGeral(p); // já conta desconto e ajuste
  const mo  = (p.itensMaoDeObra  || []).reduce((s,i) => s + (parseFloat(i.valorFinal) || i.qtd * i.valorUnit || 0), 0);
  const mat = (p.itensMateriais  || []).reduce((s,i) => s + (parseFloat(i.valorFinal) || i.qtd * i.valorUnit || 0), 0);
  const ajMO  = parseFloat(p.ajusteMaoDeObra  || 0);
  const ajMat = parseFloat(p.ajusteMateriais  || 0);
  return mo + mat + ajMO + ajMat;
}

// ====================================================
// APRESENTAÇÃO 1 — DEMANDA (branco / laranja)
// ====================================================
async function gerarApresentacaoDemandaPptx(mesesArr, ano, selecionados) {
  // Suporta mês único (retrocompatível) ou array de meses
  const mesesSel = Array.isArray(mesesArr) ? mesesArr : [mesesArr];
  // Para apresentação demanda, usa o primeiro mês selecionado como referência,
  // mas inclui dados acumulados de todos os meses selecionados
  const mes = mesesSel[0];
  const nomePeriodo = mesesSel.length === 12 ? "Anual " + ano
    : mesesSel.length === 1 ? MESES_NOMES[mes] + " / " + ano
    : MESES_NOMES[mesesSel[0]] + " a " + MESES_NOMES[mesesSel[mesesSel.length-1]] + " / " + ano;
  const PG = window.PptxGenJS || pptxgen;
  const pres = new PG();
  pres.layout = "LAYOUT_16x9";
  const D = {
    bg:"FFFFFF", laranja:"FF6A00", escuro:"1A1A1A",
    cinza:"F5F5F5", verde:"1C8A4B", azul:"2B6CB0",
    texto:"333333", texto2:"777777",
  };

  const propostas = lerPropostas2();
  const nomeMes = MESES_NOMES[mes];
  const doMes = propostas.filter(p => {
    const d = new Date(p.criadoEm);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });

  // ── CAPA
  if (selecionados.includes("capa")) {
    const s = pres.addSlide();
    s.addShape(pres.ShapeType.rect, {x:0,y:0,w:5,h:5.625,fill:{color:D.laranja}});
    s.addShape(pres.ShapeType.rect, {x:5,y:0,w:5,h:5.625,fill:{color:D.bg}});
    s.addText("FNX DEV", {x:0.4,y:1.8,w:4.2,h:0.7,fontSize:40,bold:true,color:"FFFFFF",fontFace:"Montserrat",margin:0});
    s.addText("Sistema de Gestão", {x:0.4,y:2.5,w:4.2,h:0.4,fontSize:14,color:"FFFFFF",fontFace:"Montserrat",margin:0});
    s.addText("Acompanhamento de", {x:5.3,y:1.5,w:4.4,h:0.4,fontSize:14,color:D.texto2,fontFace:"Montserrat",margin:0});
    s.addText("Tarefa", {x:5.3,y:1.95,w:4.4,h:0.85,fontSize:44,bold:true,color:D.escuro,fontFace:"Montserrat",margin:0});
    s.addText(nomeMes + " / " + ano, {x:5.3,y:2.85,w:4.4,h:0.4,fontSize:15,color:D.texto2,fontFace:"Montserrat",margin:0});
  }

  // ── RESUMO DE PROPOSTAS DO MÊS
  if (selecionados.includes("propostas")) {
    const s = pres.addSlide();
    s.background = {color:D.bg};
    s.addText("Propostas — " + nomeMes, {x:0.5,y:0.25,w:9,h:0.6,fontSize:26,bold:true,color:D.escuro,fontFace:"Montserrat",margin:0});
    s.addText("Resumo das estimativas do período",{x:0.5,y:0.85,w:9,h:0.32,fontSize:12,color:D.texto2,fontFace:"Montserrat",margin:0});

    const aprov   = doMes.filter(p => p.status==="andamento"||p.status==="finalizada").length;
    const reprov  = doMes.filter(p => p.status==="negada").length;
    const analise = doMes.filter(p => p.status==="analise").length;
    const orcam   = doMes.filter(p => p.status==="orcamento").length;
    const total   = doMes.length;
    const valorTotal = doMes.reduce((s,p) => s + totalProposta(p), 0);

    const cards = [
      {rot:"Total",       val:String(total),  cor:D.escuro},
      {rot:"Aprovadas",   val:String(aprov),  cor:D.verde},
      {rot:"Em Aprovação",  val:String(analise),cor:"E8A000"},
      {rot:"Negadas",     val:String(reprov), cor:"E74C3C"},
    ];
    cards.forEach((c,i) => {
      const x = 0.5 + i*2.3;
      s.addShape(pres.ShapeType.rect,{x,y:1.45,w:2.1,h:1.3,fill:{color:D.cinza},line:{color:D.cinza,width:0}});
      s.addText(c.val,{x,y:1.55,w:2.1,h:0.65,fontSize:34,bold:true,color:c.cor,fontFace:"Montserrat",align:"center",margin:0});
      s.addText(c.rot,{x,y:2.22,w:2.1,h:0.3,fontSize:10,color:D.texto2,fontFace:"Montserrat",align:"center",margin:0});
    });

    // Card de valor total
    s.addShape(pres.ShapeType.rect,{x:0.5,y:2.95,w:4.7,h:0.9,fill:{color:D.laranja},line:{color:D.laranja,width:0}});
    s.addText("Montante do Período",{x:0.6,y:3.0,w:4.5,h:0.3,fontSize:11,color:"FFFFFF",fontFace:"Montserrat",margin:0});
    s.addText(fmtR(valorTotal),{x:0.6,y:3.3,w:4.5,h:0.45,fontSize:22,bold:true,color:"FFFFFF",fontFace:"Montserrat",margin:0});

    // Donut
    if (total > 0) {
      s.addChart(pres.ChartType.doughnut, [
        {name:"Propostas",labels:["Aprovadas","Em Aprovação","Estimativa","Negadas"],
         values:[aprov,analise,orcam,reprov]}
      ], {
        x:5.4,y:1.35,w:4.3,h:3.9,
        chartColors:[D.verde,"E8A000",D.azul,"E74C3C"],
        showLegend:true,legendPos:"b",legendFontSize:10,
        showValue:true,dataLabelFontSize:11,dataLabelColor:"FFFFFF",
        showTitle:false,holeSize:40,
      });
    }
  }

  // ── PROPOSTAS POR STATUS AO LONGO DOS MESES DO ANO
  if (selecionados.includes("propostas_mes")) {
    const todas = lerPropostas2().filter(p => new Date(p.criadoEm).getFullYear() === ano);
    const s = pres.addSlide();
    s.background = {color:D.bg};
    s.addText("Propostas por Mês — " + ano, {x:0.5,y:0.25,w:9,h:0.6,fontSize:26,bold:true,color:D.escuro,fontFace:"Montserrat",margin:0});

    const labels = MESES_ABREV;
    const aprov  = labels.map((_,i) => todas.filter(p => new Date(p.criadoEm).getMonth()===i && (p.status==="andamento"||p.status==="finalizada")).length);
    const reprov = labels.map((_,i) => todas.filter(p => new Date(p.criadoEm).getMonth()===i && p.status==="negada").length);
    const semRet = labels.map((_,i) => todas.filter(p => new Date(p.criadoEm).getMonth()===i && p.status==="orcamento").length);

    s.addChart(pres.ChartType.bar, [
      {name:"Aprovadas",   labels, values:aprov},
      {name:"Negadas",     labels, values:reprov},
      {name:"Em Estimativa",labels, values:semRet},
    ], {
      x:0.5,y:1.1,w:9,h:4.2,
      chartColors:[D.verde,"E74C3C",D.laranja],
      barGrouping:"clustered",
      showValue:true,dataLabelPosition:"outEnd",dataLabelFontSize:9,
      catAxisLabelFontSize:11,valAxisLabelFontSize:10,
      showTitle:false,showLegend:true,legendPos:"b",legendFontSize:10,
      valGridLine:{color:"EEEEEE",size:0.5},
    });
  }

  // ── SLIDE ENCERRAMENTO
  {
    const s = pres.addSlide();
    s.addShape(pres.ShapeType.rect,{x:0,y:0,w:5,h:5.625,fill:{color:D.laranja}});
    s.addShape(pres.ShapeType.rect,{x:5,y:0,w:5,h:5.625,fill:{color:D.bg}});
    s.addText("FNX DEV", {x:0.4,y:2.2,w:4.2,h:0.7,fontSize:36,bold:true,color:"FFFFFF",fontFace:"Montserrat",margin:0});
    s.addText("Sistema de Gestão", {x:0.4,y:3.0,w:4.2,h:0.4,fontSize:13,color:"FFFFFF",fontFace:"Montserrat",margin:0});
    s.addText("Obrigado", {x:5.3,y:2.0,w:4.4,h:0.8,fontSize:40,bold:true,color:D.escuro,fontFace:"Montserrat",margin:0});
    s.addText(new Date().toLocaleDateString("pt-BR"), {x:5.3,y:2.9,w:4.4,h:0.4,fontSize:13,color:D.texto2,fontFace:"Montserrat",margin:0});
  }

  await pres.writeFile({fileName: "apresentacao-demanda-" + nomeMes + "-" + ano + ".pptx"});
}

// ====================================================
// APRESENTAÇÃO 2 — FINANCEIRO (preto / laranja)
// ====================================================
async function gerarApresentacaoFinanceiroPptx(mesesArr, ano, selecionados) {
  const mesesSel = Array.isArray(mesesArr) ? mesesArr : [mesesArr];
  const mes = mesesSel[0];
  const nomePeriodo = mesesSel.length === 12 ? "Anual " + ano
    : mesesSel.length === 1 ? MESES_NOMES[mes] + " / " + ano
    : MESES_NOMES[mesesSel[0]] + " a " + MESES_NOMES[mesesSel[mesesSel.length-1]] + " / " + ano;
  const PG = window.PptxGenJS || pptxgen;
  const pres = new PG();
  pres.layout = "LAYOUT_16x9";
  const F = {
    bg:"111111", laranja:"FF6A00", card:"222222",
    texto:"FFFFFF", texto2:"AAAAAA",
    verde:"2ECC71", vermelho:"E74C3C",
  };
  const nomeMes = nomePeriodo;

  // Dados reais do localStorage
  const financeiro  = lerFinanceiro2();
  const obras       = lerObras2();
  const usuarios    = await lerUsuariosDoServidor();
  const boletos     = lerBoletos2();
  const propostas   = lerPropostas2();

  // Extrato (todas as contas do Gerenciamento de Contas)
  await _contasRelatorioPronto;
  let totalEntradas = 0, totalSaidas = 0;
  _lancamentosExtratoRelatorio.forEach(l => {
    if (l.tipo === "saida") totalSaidas += parseFloat(l.valor)||0;
    else totalEntradas += parseFloat(l.valor)||0;
  });

  // ── CAPA
  if (selecionados.includes("capa")) {
    const s = pres.addSlide();
    s.background = {color:F.bg};
    s.addShape(pres.ShapeType.ellipse,{x:6.5,y:-1.5,w:5,h:5,fill:{color:F.laranja},line:{color:F.laranja,width:0},transparency:85});
    s.addShape(pres.ShapeType.ellipse,{x:7.5,y:3.0,w:3,h:3,fill:{color:F.laranja},line:{color:F.laranja,width:0},transparency:90});
    s.addText("FNX DEV",{x:0.5,y:1.3,w:9,h:1,fontSize:52,bold:true,color:F.laranja,fontFace:"Montserrat",margin:0});
    s.addText("Sistema de Gestão",{x:0.5,y:2.35,w:6,h:0.45,fontSize:15,color:F.texto2,fontFace:"Montserrat",margin:0});
    s.addText("Relatório Financeiro",{x:0.5,y:3.0,w:6,h:0.65,fontSize:28,bold:true,color:F.texto,fontFace:"Montserrat",margin:0});
    s.addText(nomeMes + " / " + ano,{x:0.5,y:3.7,w:6,h:0.4,fontSize:13,color:F.texto2,fontFace:"Montserrat",margin:0});
  }

  // ── FLUXO DE CAIXA
  if (selecionados.includes("resumo_financeiro")) {
    const s = pres.addSlide();
    s.background = {color:F.bg};
    s.addText("Fluxo de Caixa",{x:0.5,y:0.2,w:9,h:0.55,fontSize:24,bold:true,color:F.laranja,fontFace:"Montserrat",margin:0});
    s.addText("Entradas × Saídas × Saldo",{x:0.5,y:0.75,w:9,h:0.32,fontSize:12,color:F.texto2,fontFace:"Montserrat",margin:0});

    const saldo = totalEntradas - totalSaidas;
    const cardsF = [
      {rot:"Total Entradas",val:fmtR(totalEntradas),cor:F.verde},
      {rot:"Total Saídas",  val:fmtR(totalSaidas),  cor:F.vermelho},
      {rot:"Saldo",         val:fmtR(saldo),         cor:saldo>=0?F.verde:F.vermelho},
    ];
    cardsF.forEach((c,i) => {
      const x = 0.5 + i*3.1;
      s.addShape(pres.ShapeType.rect,{x,y:1.35,w:2.9,h:1.2,fill:{color:F.card},line:{color:F.card,width:0}});
      s.addText(c.val,{x,y:1.48,w:2.9,h:0.55,fontSize:17,bold:true,color:c.cor,fontFace:"Montserrat",align:"center",margin:0});
      s.addText(c.rot,{x,y:2.05,w:2.9,h:0.3,fontSize:10,color:F.texto2,fontFace:"Montserrat",align:"center",margin:0});
    });

    // Barras por banco
    const idsContas = Object.keys(BANCOS);
    const bancos = idsContas.map((id) => BANCOS[id].nome);
    const entradasPorBanco = idsContas.map((id) => _lancamentosExtratoRelatorio
      .filter((l) => l.banco === id && l.tipo !== "saida").reduce((s,l)=>s+(parseFloat(l.valor)||0),0));
    const saidasPorBanco = idsContas.map((id) => _lancamentosExtratoRelatorio
      .filter((l) => l.banco === id && l.tipo === "saida").reduce((s,l)=>s+(parseFloat(l.valor)||0),0));

    s.addChart(pres.ChartType.bar,[
      {name:"Entradas",labels:bancos,values:entradasPorBanco},
      {name:"Saídas",  labels:bancos,values:saidasPorBanco},
    ],{
      x:0.5,y:2.7,w:9,h:2.65,
      chartColors:[F.verde,F.vermelho],
      barGrouping:"clustered",
      showValue:true,dataLabelPosition:"inEnd",dataLabelFontSize:9,dataLabelColor:"FFFFFF",
      catAxisLabelFontSize:11,catAxisLabelColor:F.texto2,
      valAxisLabelFontSize:9,valAxisLabelColor:F.texto2,
      showTitle:false,showLegend:true,legendPos:"b",legendFontSize:10,legendColor:F.texto2,
      valGridLine:{color:"333333",size:0.5},
    });
  }

  // ── FUNCIONÁRIOS
  if (selecionados.includes("funcionarios")) {
    const s = pres.addSlide();
    s.background = {color:F.bg};
    s.addText("Funcionários",{x:0.5,y:0.2,w:9,h:0.55,fontSize:24,bold:true,color:F.laranja,fontFace:"Montserrat",margin:0});
    s.addText("Pagamentos registrados no período",{x:0.5,y:0.75,w:9,h:0.32,fontSize:12,color:F.texto2,fontFace:"Montserrat",margin:0});

    const totalPago = financeiro.reduce((s,f)=>s+(parseFloat(f.valor)||0),0);

    // Agrupa por nome para o gráfico
    const porNome = {};
    financeiro.forEach(f => { porNome[f.nome] = (porNome[f.nome]||0)+(parseFloat(f.valor)||0); });
    const nomesFunc = Object.keys(porNome);
    const valoresFunc = nomesFunc.map(n => porNome[n]);

    // Cards topo
    const cf = [
      {rot:"Funcionários",  val:String(usuarios.length),      cor:F.laranja},
      {rot:"Registros Pag.",val:String(financeiro.length),    cor:F.texto2},
      {rot:"Total Pago",    val:fmtR(totalPago),              cor:F.verde},
    ];
    cf.forEach((c,i) => {
      const x = 0.5+i*3.1;
      s.addShape(pres.ShapeType.rect,{x,y:1.35,w:2.9,h:1.1,fill:{color:F.card},line:{color:F.card,width:0}});
      s.addText(c.val,{x,y:1.45,w:2.9,h:0.5,fontSize:c.val.length>9?14:20,bold:true,color:c.cor,fontFace:"Montserrat",align:"center",margin:0});
      s.addText(c.rot,{x,y:1.95,w:2.9,h:0.28,fontSize:10,color:F.texto2,fontFace:"Montserrat",align:"center",margin:0});
    });

    if (nomesFunc.length > 0) {
      s.addChart(pres.ChartType.doughnut,[
        {name:"Pagamentos",labels:nomesFunc,values:valoresFunc}
      ],{
        x:0.5,y:2.6,w:4.5,h:2.7,
        chartColors:[F.laranja,"E8A000",F.verde,"9B59B6","2B6CB0","E74C3C"],
        showLegend:true,legendPos:"b",legendFontSize:9,legendColor:F.texto2,
        showValue:true,dataLabelFontSize:10,dataLabelColor:"FFFFFF",
        showTitle:false,holeSize:40,
      });
    }

    // Barras por funcionário
    if (nomesFunc.length > 0) {
      s.addChart(pres.ChartType.bar,[
        {name:"Pago",labels:nomesFunc,values:valoresFunc}
      ],{
        x:5.2,y:2.6,w:4.5,h:2.7,
        chartColors:[F.laranja],
        barDir:"bar",
        showValue:true,dataLabelPosition:"inEnd",dataLabelFontSize:9,dataLabelColor:"FFFFFF",
        catAxisLabelFontSize:10,catAxisLabelColor:F.texto2,
        valAxisLabelFontSize:9,valAxisLabelColor:F.texto2,
        showTitle:false,showLegend:false,
        valGridLine:{color:"333333",size:0.5},
      });
    }
  }

  // ── OBRAS DETALHAMENTO
  if (selecionados.includes("obras")) {
    // Slide 1: Tabela
    const s = pres.addSlide();
    s.background = {color:F.bg};
    s.addText("Projetos — Detalhamento",{x:0.5,y:0.2,w:9,h:0.55,fontSize:24,bold:true,color:F.laranja,fontFace:"Montserrat",margin:0});
    s.addText("Serviços e Produtos: valor cobrado × gasto e lucro por projeto",{x:0.5,y:0.75,w:9,h:0.32,fontSize:12,color:F.texto2,fontFace:"Montserrat",margin:0});

    const obrasComDados = obras.filter(o => o.valorMaoDeObraOrcamento || o.valorMateriaisOrcamento || (o.funcionarios||[]).length || (o.materiais||[]).length);

    const cols = [
      {x:0.3,w:2.0,label:"Projeto",     align:"l"},
      {x:2.4,w:1.4,label:"Serviços Cobr.",align:"r"},
      {x:3.9,w:1.4,label:"Serviços Gasto",align:"r"},
      {x:5.4,w:1.4,label:"Mat. Cobr.",align:"r"},
      {x:6.9,w:1.4,label:"Mat. Gasto",align:"r"},
      {x:8.4,w:1.35,label:"Lucro",    align:"r"},
    ];

    s.addShape(pres.ShapeType.rect,{x:0.3,y:1.15,w:9.4,h:0.36,fill:{color:F.laranja},line:{color:F.laranja,width:0}});
    cols.forEach(c => s.addText(c.label,{x:c.x+0.06,y:1.18,w:c.w,h:0.3,fontSize:9,bold:true,color:"111111",fontFace:"Montserrat",align:c.align,margin:0}));

    const maxLinhas = Math.min(obrasComDados.length, 6);
    let totalMoCob=0,totalMoGasto=0,totalMatCob=0,totalMatGasto=0;

    obrasComDados.slice(0, maxLinhas).forEach((o,i) => {
      const moCob   = parseFloat(o.valorMaoDeObraOrcamento)||0;
      const moGasto = (o.funcionarios||[]).reduce((s,f)=>s+(parseFloat(f.valorPago)||0),0);
      const matCob  = parseFloat(o.valorMateriaisOrcamento)||0;
      const matGasto= (o.materiais||[]).reduce((s,m)=>s+(parseFloat(m.valor)||0),0);
      const lucro   = (moCob-moGasto)+(matCob-matGasto);
      totalMoCob+=moCob; totalMoGasto+=moGasto; totalMatCob+=matCob; totalMatGasto+=matGasto;

      const y = 1.56 + i*0.62;
      s.addShape(pres.ShapeType.rect,{x:0.3,y,w:9.4,h:0.55,fill:{color:i%2===0?F.card:"1C1C1C"},line:{color:F.card,width:0}});
      const vals = [
        {x:cols[0].x,w:cols[0].w,txt:o.cliente||o.servico||"Projeto",bold:true,cor:F.texto,align:"l"},
        {x:cols[1].x,w:cols[1].w,txt:fmtR(moCob),  bold:false,cor:F.laranja,align:"r"},
        {x:cols[2].x,w:cols[2].w,txt:fmtR(moGasto),bold:false,cor:F.vermelho,align:"r"},
        {x:cols[3].x,w:cols[3].w,txt:fmtR(matCob), bold:false,cor:F.laranja,align:"r"},
        {x:cols[4].x,w:cols[4].w,txt:fmtR(matGasto),bold:false,cor:F.vermelho,align:"r"},
        {x:cols[5].x,w:cols[5].w,txt:fmtR(lucro),  bold:true,cor:lucro>=0?F.verde:F.vermelho,align:"r"},
      ];
      vals.forEach(v=>s.addText(v.txt,{x:v.x+0.06,y:y+0.1,w:v.w,h:0.35,fontSize:9,bold:v.bold,color:v.cor,fontFace:"Montserrat",align:v.align,margin:0}));
    });

    // Linha de total
    const totalLucro=(totalMoCob-totalMoGasto)+(totalMatCob-totalMatGasto);
    const yTot = 1.56 + maxLinhas*0.62;
    s.addShape(pres.ShapeType.rect,{x:0.3,y:yTot,w:9.4,h:0.36,fill:{color:"333333"},line:{color:"333333",width:0}});
    [
      {x:cols[0].x,w:cols[0].w,txt:"TOTAL",             align:"l"},
      {x:cols[1].x,w:cols[1].w,txt:fmtR(totalMoCob),   align:"r"},
      {x:cols[2].x,w:cols[2].w,txt:fmtR(totalMoGasto), align:"r"},
      {x:cols[3].x,w:cols[3].w,txt:fmtR(totalMatCob),  align:"r"},
      {x:cols[4].x,w:cols[4].w,txt:fmtR(totalMatGasto),align:"r"},
      {x:cols[5].x,w:cols[5].w,txt:fmtR(totalLucro),   align:"r"},
    ].forEach((v,i)=>s.addText(v.txt,{x:v.x+0.06,y:yTot+0.04,w:v.w,h:0.28,fontSize:9,bold:true,
      color:i===5?(totalLucro>=0?F.verde:F.vermelho):F.texto,fontFace:"Montserrat",align:v.align,margin:0}));
  }

  // ── BOLETOS
  if (selecionados.includes("boletos")) {
    const s = pres.addSlide();
    s.background = {color:F.bg};
    s.addText("Boletos",{x:0.5,y:0.2,w:9,h:0.55,fontSize:24,bold:true,color:F.laranja,fontFace:"Montserrat",margin:0});
    s.addText("Situação geral dos boletos cadastrados",{x:0.5,y:0.75,w:9,h:0.32,fontSize:12,color:F.texto2,fontFace:"Montserrat",margin:0});

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const pend = boletos.filter(b=>!b.pago&&b.dataVencimento&&new Date(b.dataVencimento+"T00:00:00")>=hoje);
    const atras= boletos.filter(b=>!b.pago&&b.dataVencimento&&new Date(b.dataVencimento+"T00:00:00")<hoje);
    const pagos = boletos.filter(b=>b.pago);

    const cb = [
      {rot:"Pendentes",val:String(pend.length)+" — "+fmtR(pend.reduce((s,b)=>s+(b.valor||0),0)),cor:"2B6CB0"},
      {rot:"Atrasados",val:String(atras.length)+" — "+fmtR(atras.reduce((s,b)=>s+(b.valor||0),0)),cor:F.vermelho},
      {rot:"Pagos",    val:String(pagos.length)+" — "+fmtR(pagos.reduce((s,b)=>s+(b.valor||0),0)),cor:F.verde},
    ];
    cb.forEach((c,i)=>{
      const x=0.5+i*3.1;
      s.addShape(pres.ShapeType.rect,{x,y:1.35,w:2.9,h:1.1,fill:{color:F.card},line:{color:F.card,width:0}});
      s.addText(c.val,{x,y:1.45,w:2.9,h:0.5,fontSize:12,bold:true,color:c.cor,fontFace:"Montserrat",align:"center",margin:0});
      s.addText(c.rot,{x,y:1.97,w:2.9,h:0.28,fontSize:10,color:F.texto2,fontFace:"Montserrat",align:"center",margin:0});
    });

    if (atras.length > 0) {
      const linhas = atras.slice(0,6).map(b=>[
        b.nome||"—",
        b.dataVencimento ? new Date(b.dataVencimento+"T00:00:00").toLocaleDateString("pt-BR") : "—",
        fmtR(b.valor||0),
      ]);
      s.addText("Atrasados:",{x:0.5,y:2.65,w:9,h:0.3,fontSize:11,bold:true,color:F.vermelho,fontFace:"Montserrat",margin:0});
      // Cabeçalho mini tabela
      s.addShape(pres.ShapeType.rect,{x:0.5,y:3.0,w:9.2,h:0.3,fill:{color:"333333"},line:{color:"333333",width:0}});
      [{x:0.56,w:5.5,t:"Nome"},{x:6.1,w:1.8,t:"Vencimento"},{x:8.0,w:1.6,t:"Valor"}].forEach(h=>
        s.addText(h.t,{x:h.x,y:3.02,w:h.w,h:0.26,fontSize:9,bold:true,color:F.texto,fontFace:"Montserrat",margin:0}));
      linhas.forEach((l,i)=>{
        const y=3.32+i*0.38;
        s.addShape(pres.ShapeType.rect,{x:0.5,y,w:9.2,h:0.34,fill:{color:i%2===0?F.card:"1C1C1C"},line:{color:F.card,width:0}});
        [{x:0.56,w:5.5,t:l[0]},{x:6.1,w:1.8,t:l[1]},{x:8.0,w:1.6,t:l[2]}].forEach(c=>
          s.addText(c.t,{x:c.x,y:y+0.05,w:c.w,h:0.24,fontSize:9,color:F.texto,fontFace:"Montserrat",margin:0}));
      });
    }
  }

  // ── ENCERRAMENTO
  {
    const s = pres.addSlide();
    s.background = {color:F.bg};
    s.addShape(pres.ShapeType.ellipse,{x:-0.5,y:3.5,w:4,h:4,fill:{color:F.laranja},line:{color:F.laranja,width:0},transparency:88});
    s.addText("Obrigado",{x:1,y:1.6,w:8,h:1.2,fontSize:54,bold:true,color:F.texto,fontFace:"Montserrat",align:"center",margin:0});
    s.addText("FNX DEV",{x:1,y:2.9,w:8,h:0.5,fontSize:16,color:F.texto2,fontFace:"Montserrat",align:"center",margin:0});
    s.addText(new Date().toLocaleDateString("pt-BR"),{x:1,y:3.5,w:8,h:0.4,fontSize:12,color:F.texto2,fontFace:"Montserrat",align:"center",margin:0});
  }

  await pres.writeFile({fileName: "apresentacao-financeiro-" + nomeMes + "-" + ano + ".pptx"});
}


definirTipo("funcionarios");
renderListaRelatorios();
Promise.all([_dadosRelatorioPronto, _contasRelatorioPronto]).then(() => renderListaRelatorios());