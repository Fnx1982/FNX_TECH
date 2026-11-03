// ====================================================
// CHAVES DE ARMAZENAMENTO (localStorage é usado só como origem
// da migração única para a nuvem — depois disso, a nuvem manda)
// ====================================================
const CHAVE_SETORES = "materiais_setores";
const CHAVE_MATERIAIS = "materiais_lista";

// Seleciona a unidade no dropdown com segurança: se o valor salvo não
// bater com nenhuma das opções padrão (dado antigo, de antes dessa
// lista existir), adiciona uma opção extra temporária em vez de
// perder silenciosamente o dado.
function definirUnidadeComSeguranca(selectEl, valor) {
  valor = (valor || "UND").toUpperCase();
  // Sempre remove a opção extra do item editado ANTERIORMENTE primeiro
  // — senão, ao editar um item com unidade padrão logo depois de um
  // item com unidade antiga, a opção extra antiga fica esquecida ali.
  const extraAntiga = selectEl.querySelector("option[data-extra]");
  if (extraAntiga) extraAntiga.remove();

  const jaExiste = [...selectEl.options].some((o) => o.value === valor);
  if (!jaExiste) {
    const opt = document.createElement("option");
    opt.value = valor;
    opt.textContent = valor + " (valor antigo)";
    opt.dataset.extra = "1";
    selectEl.appendChild(opt);
  }
  selectEl.value = valor;
}

// ====================================================
// ELEMENTOS
// ====================================================
const modalSetor = document.getElementById("modalSetor");
const btnAbrirSetor = document.getElementById("btnAbrirSetor");
const fecharModalSetor = document.getElementById("fecharModalSetor");
const formSetor = document.getElementById("form-setor");
const novoSetorInput = document.getElementById("novoSetorInput");
const listaSetores = document.getElementById("listaSetores");

const modalMaterial = document.getElementById("modalMaterial");
const btnAbrirMaterial = document.getElementById("btnAbrirMaterial");
const fecharModalMaterial = document.getElementById("fecharModalMaterial");
const tituloModalMaterial = document.getElementById("tituloModalMaterial");
const form = document.getElementById("form-material");
const selectSetorMaterial = document.getElementById("setorMaterial");
const btnSubmitMaterial = document.getElementById("btnSubmitMaterial");

const buscaInput = document.getElementById("buscaTexto");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");

// Multi-select de Setor (filtro)
const multiFiltroSetor = document.getElementById("multiFiltroSetor");
const toggleFiltroSetor = document.getElementById("toggleFiltroSetor");
const painelFiltroSetor = document.getElementById("painelFiltroSetor");
const resumoFiltroSetor = document.getElementById("resumoFiltroSetor");

const btnVisaoSetor = document.getElementById("btnVisaoSetor");
const btnVisaoMaterial = document.getElementById("btnVisaoMaterial");
const gruposDiv = document.getElementById("grupos");
const semResultados = document.getElementById("semResultados");

const totalItensValor = document.getElementById("totalItensValor");
const totalQuantidadeValor = document.getElementById("totalQuantidadeValor");
const totalValorValor = document.getElementById("totalValorValor");

// ====================================================
// ESTADO
// ====================================================
let setores = [];
let materiais = [];

let visaoAtual = "setor"; // "setor" ou "material"
let indiceEditando = null;
let gruposFechados = new Set();
let setoresFiltroSel = new Set(); // vazio = todos os setores
let rascunhoAtualIdMaterial = null; // id do rascunho de auto-save em andamento
let idMaterialOriginalRascunho = null; // se o rascunho retomado era edição de um material já existente, guarda o id dele aqui

// ====================================================
// MODAIS — abrir / fechar
// ====================================================
function abrirModal(modal) {
  modal.classList.add("active");
}
function fecharModalEl(modal) {
  modal.classList.remove("active");
}

btnAbrirSetor.addEventListener("click", () => abrirModal(modalSetor));
fecharModalSetor.addEventListener("click", () => fecharModalEl(modalSetor));
modalSetor.addEventListener("click", (e) => {
  if (e.target === modalSetor) fecharModalEl(modalSetor);
});

function fecharModalMaterialComEstado() {
  fecharModalEl(modalMaterial);
  rascunhoAtualIdMaterial = null;
  renderPendentesMateriais();
}

btnAbrirMaterial.addEventListener("click", () => {
  if (indiceEditando === null) {
    form.reset();
    document.getElementById("listaCamposExtrasMaterial").innerHTML = "";
    document.getElementById("origemMaterial").value = "0";
    document.getElementById("unidadeMaterial").value = "UND";
    if (typeof preencherFiscalMaterial === "function") preencherFiscalMaterial({});
    tituloModalMaterial.textContent = "Novo Material";
    btnSubmitMaterial.textContent = "Adicionar";
    rascunhoAtualIdMaterial = null;
    idMaterialOriginalRascunho = null;
  }
  abrirModal(modalMaterial);
});

// Botão que aparece quando a busca não acha nada — abre o mesmo
// modal de sempre (com todos os campos fiscais), só que já com o
// nome preenchido a partir do que a pessoa buscou.
document.getElementById("btnCadastrarDaBusca").addEventListener("click", () => {
  const termo = buscaInput.value.trim();
  indiceEditando = null;
  form.reset();
  document.getElementById("listaCamposExtrasMaterial").innerHTML = "";
  document.getElementById("origemMaterial").value = "0";
  document.getElementById("unidadeMaterial").value = "UND";
  if (typeof preencherFiscalMaterial === "function") preencherFiscalMaterial({});
  document.getElementById("nomeMaterial").value = termo;
  tituloModalMaterial.textContent = "Novo Material";
  btnSubmitMaterial.textContent = "Adicionar";
  rascunhoAtualIdMaterial = null;
  idMaterialOriginalRascunho = null;
  abrirModal(modalMaterial);
});

fecharModalMaterial.addEventListener("click", fecharModalMaterialComEstado);
modalMaterial.addEventListener("click", (e) => {
  if (e.target === modalMaterial) fecharModalMaterialComEstado();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  fecharModalEl(modalSetor);
  fecharModalMaterialComEstado();
});

// ====================================================
// SETORES (cadastro fixo)
// ====================================================
function salvarSetores() {
  localStorage.setItem(CHAVE_SETORES, JSON.stringify(setores)); // mantém uma cópia local de segurança
  apiDataSet("materiaisSetores", setores).catch((e) => console.warn("Falha ao salvar setores de material na nuvem:", e));
}

function renderSetores() {
  // <select> do formulário de material
  const valorSelecionado = selectSetorMaterial.value;
  selectSetorMaterial.innerHTML = '<option value="" disabled selected>Selecione o setor</option>';
  setores.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    selectSetorMaterial.appendChild(opt);
  });
  if (setores.includes(valorSelecionado)) {
    selectSetorMaterial.value = valorSelecionado;
  }

  // O filtro de Setor agora é multi-select (configurado em
  // configurarMultiSelect / msFiltroSetor); aqui só atualizamos
  // o resumo, já que as opções são lidas direto de "setores".
  if (typeof msFiltroSetor !== "undefined") {
    msFiltroSetor.atualizarResumo();
  }

  // Chips
  listaSetores.innerHTML = "";
  if (setores.length === 0) {
    listaSetores.innerHTML = '<p class="sem-obras">Nenhum setor cadastrado ainda.</p>';
    return;
  }
  setores.forEach((s, index) => {
    const chip = document.createElement("div");
    chip.className = "chip-obra";
    chip.innerHTML = `<span>${escaparHtml(s)}</span>`;
    const btnRemover = document.createElement("button");
    btnRemover.textContent = "×";
    btnRemover.title = "Excluir setor";
    btnRemover.addEventListener("click", () => excluirSetor(index));
    chip.appendChild(btnRemover);
    listaSetores.appendChild(chip);
  });
}

async function excluirSetor(index) {
  const nome = setores[index];
  const usado = materiais.some((m) => m.setor === nome);
  if (usado) {
    const confirmado = await confirmarAcao(
      `Excluir o setor "${nome}"?`,
      "Os materiais já cadastrados não serão apagados, mas esse setor não vai mais aparecer na lista para novos materiais."
    );
    if (!confirmado) return;
  }
  setores.splice(index, 1);
  salvarSetores();
  renderSetores();
}

formSetor.addEventListener("submit", (e) => {
  e.preventDefault();
  limparErroCampo(novoSetorInput);
  const nome = novoSetorInput.value.trim();
  if (!nome) return;
  if (setores.includes(nome)) {
    marcarCampoComErro(novoSetorInput, "Esse setor já está cadastrado.");
    return;
  }
  setores.push(nome);
  salvarSetores();
  renderSetores();
  novoSetorInput.value = "";
});
limparErroAoEditar(novoSetorInput);

// ====================================================
// MATERIAIS (cadastro / edição)
// ====================================================
// (o "salvarMateriais()" antigo, que regravava o array inteiro no
// localStorage, foi substituído por salvar/excluir POR ITEM
// diretamente na nuvem — ver submit/excluir abaixo)

// ── Campos extras (livres, key/valor) ────────────────────────────
function adicionarLinhaExtraMaterial(campo) {
  campo = campo || { nome: "", valor: "" };
  const container = document.getElementById("listaCamposExtrasMaterial");
  const linha = document.createElement("div");
  linha.style.cssText = "display:flex; gap:8px;";
  linha.innerHTML = `
    <input type="text" class="extra-nome-material" placeholder="Nome do código (ex: cÉnq IPI)" value="${escaparHtml(campo.nome || "")}" style="flex:1;" />
    <input type="text" class="extra-valor-material" placeholder="Valor" value="${escaparHtml(campo.valor || "")}" style="flex:1;" />
    <button type="button" class="btn-remover-linha-extra" style="background:none;border:none;color:#E5141B;cursor:pointer;font-size:16px;">✕</button>
  `;
  linha.querySelector(".btn-remover-linha-extra").addEventListener("click", () => linha.remove());
  container.appendChild(linha);
}

function lerCamposExtrasMaterial() {
  return [...document.querySelectorAll("#listaCamposExtrasMaterial > div")]
    .map((linha) => ({ nome: linha.querySelector(".extra-nome-material").value.trim(), valor: linha.querySelector(".extra-valor-material").value.trim() }))
    .filter((c) => c.nome);
}

document.getElementById("btnAddCampoExtraMaterial").addEventListener("click", () => adicionarLinhaExtraMaterial());

// ====================================================
// RASCUNHO AUTOMÁTICO (auto-save) — só salva enquanto o modal de
// Material estiver realmente aberto, pra não disparar save de
// campos escondidos com valor residual de uma edição anterior.
// ====================================================
function coletarDadosRascunhoMaterial() {
  const idEmEdicao = indiceEditando !== null ? materiais[indiceEditando].id : (idMaterialOriginalRascunho || null);
  return {
    id: idEmEdicao,
    nome: document.getElementById("nomeMaterial").value.trim(),
    setor: selectSetorMaterial.value,
    codigo: document.getElementById("codigoMaterial").value.trim(),
    valor: document.getElementById("valorMaterial").value ? parseFloat(document.getElementById("valorMaterial").value) : 0,
    quantidade: document.getElementById("quantidadeMaterial").value ? parseInt(document.getElementById("quantidadeMaterial").value, 10) : 0,
    observacao: document.getElementById("obsMaterial").value.trim(),
    ncm: document.getElementById("ncmMaterial").value.trim(),
    cfop: document.getElementById("cfopMaterial").value.trim(),
    cest: document.getElementById("cestMaterial").value.trim(),
    ean: document.getElementById("eanMaterial").value.trim(),
    origem: document.getElementById("origemMaterial").value,
    cstCsosn: document.getElementById("cstCsosnMaterial").value.trim(),
    unidade: document.getElementById("unidadeMaterial").value.trim().toUpperCase() || "UN",
    camposAdicionais: lerCamposExtrasMaterial(),
    fiscal: typeof lerFiscalMaterial === "function" ? lerFiscalMaterial() : undefined,
  };
}

function formularioMaterialTemConteudo(d) {
  return !!(d.nome || d.setor || d.codigo || d.valor || d.observacao || d.ncm || d.cfop || d.cest || d.ean || d.cstCsosn || (d.camposAdicionais && d.camposAdicionais.length));
}

async function salvarRascunhoAtualMaterial() {
  if (!modalMaterial.classList.contains("active")) return;
  const dados = coletarDadosRascunhoMaterial();
  if (!formularioMaterialTemConteudo(dados)) return;
  const resposta = await apiSalvarRascunho("material", rascunhoAtualIdMaterial, dados);
  if (resposta.ok) { rascunhoAtualIdMaterial = resposta.id; renderPendentesMateriais(); }
}

function salvarRascunhoAtualMaterialImediato() {
  if (!modalMaterial.classList.contains("active")) return;
  const dados = coletarDadosRascunhoMaterial();
  if (!formularioMaterialTemConteudo(dados)) return;
  if (!rascunhoAtualIdMaterial) rascunhoAtualIdMaterial = `rascunho_material_${Date.now()}`;
  apiSalvarRascunhoImediato("material", rascunhoAtualIdMaterial, dados);
}

[
  "nomeMaterial", "codigoMaterial", "valorMaterial", "quantidadeMaterial", "obsMaterial",
  "ncmMaterial", "cfopMaterial", "cestMaterial", "eanMaterial", "cstCsosnMaterial",
].forEach((id) => document.getElementById(id).addEventListener("blur", salvarRascunhoAtualMaterial));
["setorMaterial", "origemMaterial", "unidadeMaterial"].forEach((id) => document.getElementById(id).addEventListener("change", salvarRascunhoAtualMaterial));
document.getElementById("listaCamposExtrasMaterial").addEventListener("focusout", salvarRascunhoAtualMaterial);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") salvarRascunhoAtualMaterialImediato(); });
window.addEventListener("beforeunload", salvarRascunhoAtualMaterialImediato);

function continuarRascunhoMaterial(dados, idRascunho) {
  rascunhoAtualIdMaterial = idRascunho;
  idMaterialOriginalRascunho = dados.id || null;
  indiceEditando = null;
  document.getElementById("nomeMaterial").value = dados.nome || "";
  selectSetorMaterial.value = dados.setor || "";
  document.getElementById("codigoMaterial").value = dados.codigo || "";
  document.getElementById("valorMaterial").value = dados.valor || "";
  document.getElementById("quantidadeMaterial").value = dados.quantidade || "";
  document.getElementById("obsMaterial").value = dados.observacao || "";
  document.getElementById("ncmMaterial").value = dados.ncm || "";
  document.getElementById("cfopMaterial").value = dados.cfop || "";
  document.getElementById("cestMaterial").value = dados.cest || "";
  document.getElementById("eanMaterial").value = dados.ean || "";
  document.getElementById("origemMaterial").value = dados.origem || "0";
  document.getElementById("cstCsosnMaterial").value = dados.cstCsosn || "";
  if (typeof preencherFiscalMaterial === "function") preencherFiscalMaterial(dados.fiscal);
  definirUnidadeComSeguranca(document.getElementById("unidadeMaterial"), dados.unidade);
  document.getElementById("listaCamposExtrasMaterial").innerHTML = "";
  (dados.camposAdicionais || []).forEach((c) => adicionarLinhaExtraMaterial(c));
  tituloModalMaterial.textContent = dados.nome ? `Continuando rascunho — ${dados.nome}` : "Continuando rascunho";
  btnSubmitMaterial.textContent = dados.id ? "Salvar Alterações" : "Adicionar";
  abrirModal(modalMaterial);
}

async function renderPendentesMateriais() {
  const bloco = document.getElementById("blocoPendentesMateriais");
  const listaEl = document.getElementById("listaPendentesMateriais");
  if (!bloco || !listaEl) return;
  const resposta = await apiListarRascunhos("material");
  if (!resposta.ok || !resposta.rascunhos || resposta.rascunhos.length === 0) {
    bloco.style.display = "none";
    listaEl.innerHTML = "";
    return;
  }
  bloco.style.display = "block";
  listaEl.innerHTML = "";
  resposta.rascunhos.forEach((r) => {
    const d = r.dados || {};
    const dataFormatada = new Date(r.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const el = document.createElement("div");
    el.className = "item-contato";
    el.innerHTML = `
      <div>
        <div class="nome">${escaparHtml(d.nome) || "(sem nome)"} <span class="badge-tipo" style="background:#FFF1E6;color:#8A3300;">Pendente</span></div>
        <div class="meta">Salvo automaticamente em ${dataFormatada}</div>
      </div>
      <div class="acoes">
        <button class="btn-editar">Continuar editando</button>
        <button class="btn-excluir-item">Excluir</button>
      </div>
    `;
    el.querySelector(".btn-editar").addEventListener("click", () => continuarRascunhoMaterial(d, r.id));
    el.querySelector(".btn-excluir-item").addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir rascunho pendente?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await apiExcluirRascunho("material", r.id);
      renderPendentesMateriais();
    });
    listaEl.appendChild(el);
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const campoNome = document.getElementById("nomeMaterial");
  const campoCodigo = document.getElementById("codigoMaterial");
  const campoValor = document.getElementById("valorMaterial");
  const campoQuantidade = document.getElementById("quantidadeMaterial");

  limparErrosDoFormulario(form);

  const nome = campoNome.value.trim();
  const setor = selectSetorMaterial.value;
  const codigo = campoCodigo.value.trim();
  const valor = parseFloat(campoValor.value);
  // Quantidade é opcional: campo vazio é tratado como 0.
  const quantidadeBruta = campoQuantidade.value.trim();
  const quantidade = quantidadeBruta === "" ? 0 : parseInt(quantidadeBruta, 10);
  const observacao = document.getElementById("obsMaterial").value.trim();

  let temErro = false;
  if (!nome) {
    marcarCampoComErro(campoNome, "Informe o nome do material.");
    temErro = true;
  }
  if (!setor) {
    marcarCampoComErro(selectSetorMaterial, "Selecione um setor.");
    temErro = true;
  }
  if (!codigo) {
    marcarCampoComErro(campoCodigo, "Informe o código do material.");
    temErro = true;
  }
  if (isNaN(valor) || valor < 0) {
    marcarCampoComErro(campoValor, "Informe um valor válido.");
    temErro = true;
  }
  if (isNaN(quantidade) || quantidade < 0) {
    marcarCampoComErro(campoQuantidade, "Informe uma quantidade válida (ou deixe em branco).");
    temErro = true;
  }

  if (temErro) {
    focarPrimeiroErro(form);
    return;
  }

  const idEmEdicao = indiceEditando !== null ? materiais[indiceEditando].id : (idMaterialOriginalRascunho || null);
  const registro = {
    id: idEmEdicao,
    nome, setor, codigo, valor, quantidade, observacao,
    ncm: document.getElementById("ncmMaterial").value.trim(),
    cfop: document.getElementById("cfopMaterial").value.trim(),
    cest: document.getElementById("cestMaterial").value.trim(),
    ean: document.getElementById("eanMaterial").value.trim(),
    origem: document.getElementById("origemMaterial").value,
    cstCsosn: document.getElementById("cstCsosnMaterial").value.trim(),
    unidade: document.getElementById("unidadeMaterial").value.trim().toUpperCase() || "UN",
    camposAdicionais: lerCamposExtrasMaterial(),
    fiscal: typeof lerFiscalMaterial === "function" ? lerFiscalMaterial() : undefined,
  };

  btnSubmitMaterial.disabled = true;
  const textoOriginalBotao = btnSubmitMaterial.textContent;
  btnSubmitMaterial.textContent = "Salvando...";

  try {
    const resposta = await apiSalvarMaterial(registro);
    if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar material.", "erro"); return; }

    const registroSalvo = { ...registro, id: resposta.id };
    if (indiceEditando !== null) {
      materiais[indiceEditando] = registroSalvo;
      indiceEditando = null;
      tituloModalMaterial.textContent = "Novo Material";
    } else {
      materiais.push(registroSalvo);
    }

    form.reset();
    document.getElementById("listaCamposExtrasMaterial").innerHTML = "";
    document.getElementById("origemMaterial").value = "0";
    document.getElementById("unidadeMaterial").value = "UND";
    if (typeof preencherFiscalMaterial === "function") preencherFiscalMaterial({});
    if (rascunhoAtualIdMaterial) { await apiExcluirRascunho("material", rascunhoAtualIdMaterial); rascunhoAtualIdMaterial = null; }
    idMaterialOriginalRascunho = null;
    fecharModalEl(modalMaterial);
    renderTudo();
    renderPendentesMateriais();
  } finally {
    btnSubmitMaterial.disabled = false;
    btnSubmitMaterial.textContent = textoOriginalBotao;
  }
});

function editar(index) {
  const m = materiais[index];
  rascunhoAtualIdMaterial = null;
  idMaterialOriginalRascunho = null;
  document.getElementById("nomeMaterial").value = m.nome;
  selectSetorMaterial.value = m.setor;
  document.getElementById("codigoMaterial").value = m.codigo;
  document.getElementById("valorMaterial").value = m.valor;
  document.getElementById("quantidadeMaterial").value = m.quantidade;
  document.getElementById("obsMaterial").value = m.observacao || "";
  document.getElementById("ncmMaterial").value = m.ncm || "";
  document.getElementById("cfopMaterial").value = m.cfop || "";
  document.getElementById("cestMaterial").value = m.cest || "";
  document.getElementById("eanMaterial").value = m.ean || "";
  document.getElementById("origemMaterial").value = m.origem || "0";
  document.getElementById("cstCsosnMaterial").value = m.cstCsosn || "";
  if (typeof preencherFiscalMaterial === "function") preencherFiscalMaterial(m.fiscal);
  definirUnidadeComSeguranca(document.getElementById("unidadeMaterial"), m.unidade);
  document.getElementById("listaCamposExtrasMaterial").innerHTML = "";
  (m.camposAdicionais || []).forEach((c) => adicionarLinhaExtraMaterial(c));
  indiceEditando = index;
  tituloModalMaterial.textContent = "Editar Material";
  btnSubmitMaterial.textContent = "Salvar Alterações";
  abrirModal(modalMaterial);
}

async function excluir(index) {
  const confirmado = await confirmarAcao(
    "Excluir material?",
    "Essa ação não pode ser desfeita."
  );
  if (!confirmado) return;

  const material = materiais[index];
  const resposta = await apiExcluirMaterial(material.id);
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao excluir.", "erro"); return; }

  materiais.splice(index, 1);
  if (indiceEditando === index) {
    indiceEditando = null;
    form.reset();
    btnSubmitMaterial.textContent = "Adicionar";
    tituloModalMaterial.textContent = "Novo Material";
  }
  renderTudo();
}

// ====================================================
// MULTI-SELECT GENÉRICO (Filtro de Setor)
// ====================================================
function configurarMultiSelect({ painel, toggle, container, resumoEl, getOpcoes, selecionados, labelTodos, onChange }) {
  function renderPainel() {
    const opcoes = getOpcoes();
    painel.innerHTML = "";

    if (opcoes.length === 0) {
      painel.innerHTML = '<div class="multi-select-vazio">Nenhuma opção disponível ainda.</div>';
      return;
    }

    opcoes.forEach((opcao) => {
      const linha = document.createElement("label");
      linha.className = "multi-select-opcao";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selecionados.has(opcao);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selecionados.add(opcao);
        } else {
          selecionados.delete(opcao);
        }
        atualizarResumo();
        if (onChange) onChange();
      });
      linha.appendChild(checkbox);
      linha.appendChild(document.createTextNode(opcao));
      painel.appendChild(linha);
    });

    const acoes = document.createElement("div");
    acoes.className = "multi-select-acoes";
    const btnTodos = document.createElement("button");
    btnTodos.type = "button";
    btnTodos.textContent = "Selecionar todos";
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
    if (selecionados.size === 0) {
      resumoEl.textContent = labelTodos;
    } else if (selecionados.size === 1) {
      resumoEl.textContent = [...selecionados][0];
    } else {
      resumoEl.textContent = `${selecionados.size} selecionados`;
    }
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
    if (!container.contains(e.target)) {
      container.classList.remove("open");
    }
  });

  atualizarResumo();

  return { renderPainel, atualizarResumo };
}

const msFiltroSetor = configurarMultiSelect({
  painel: painelFiltroSetor,
  toggle: toggleFiltroSetor,
  container: multiFiltroSetor,
  resumoEl: resumoFiltroSetor,
  getOpcoes: () => setores,
  selecionados: setoresFiltroSel,
  labelTodos: "Todos",
  onChange: renderGrupos,
});

// ====================================================
// FILTRAGEM
// ====================================================
function aplicarFiltros() {
  const termo = buscaInput.value.trim().toLowerCase();

  return materiais
    .map((m, indexOriginal) => ({ ...m, indexOriginal }))
    .filter((m) => {
      const buscaOK =
        termo === "" ||
        m.nome.toLowerCase().includes(termo) ||
        m.codigo.toLowerCase().includes(termo) ||
        (m.observacao || "").toLowerCase().includes(termo);
      const setorOK = setoresFiltroSel.size === 0 || setoresFiltroSel.has(m.setor);
      return buscaOK && setorOK;
    });
}

// ====================================================
// RENDERIZAÇÃO AGRUPADA
// ====================================================
function chaveGrupo(item) {
  return visaoAtual === "setor" ? item.setor : item.nome;
}

function tituloGrupo(item) {
  return visaoAtual === "setor" ? item.setor : item.nome;
}

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderGrupos() {
  const itensFiltrados = aplicarFiltros();
  gruposDiv.innerHTML = "";

  if (itensFiltrados.length === 0) {
    semResultados.style.display = "block";
    const termo = buscaInput.value.trim();
    const btnCadastrar = document.getElementById("btnCadastrarDaBusca");
    const textoSemResultados = document.getElementById("semResultadosTexto");
    if (termo) {
      textoSemResultados.textContent = `Nenhum material encontrado pra "${termo}".`;
      btnCadastrar.textContent = `+ Cadastrar "${termo}" como material novo`;
      btnCadastrar.style.display = "inline-block";
    } else {
      textoSemResultados.textContent = "Nenhum material encontrado com esses filtros.";
      btnCadastrar.style.display = "none";
    }
    atualizarTotalFixo([]);
    return;
  }
  semResultados.style.display = "none";

  const grupos = new Map();
  itensFiltrados.forEach((item) => {
    const chave = chaveGrupo(item);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  });

  const chavesOrdenadas = [...grupos.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));

  chavesOrdenadas.forEach((chave) => {
    const itens = grupos.get(chave);
    const subtotalValor = itens.reduce((soma, m) => soma + m.valor * m.quantidade, 0);

    const fechado = gruposFechados.has(chave);

    const grupoEl = document.createElement("div");
    grupoEl.className = "grupo" + (fechado ? " fechado" : "");

    const cabecalho = document.createElement("div");
    cabecalho.className = "grupo-cabecalho";
    cabecalho.innerHTML = `
      <span class="grupo-titulo"><span class="grupo-seta">▾</span> ${escaparHtml(tituloGrupo(itens[0]))}</span>
      <span class="grupo-subtotal">R$ ${formatarMoeda(subtotalValor)}</span>
    `;
    cabecalho.addEventListener("click", () => {
      if (gruposFechados.has(chave)) gruposFechados.delete(chave);
      else gruposFechados.add(chave);
      renderGrupos();
    });

    const corpo = document.createElement("div");
    corpo.className = "grupo-corpo";

    const table = document.createElement("table");
    const colunaExtra = visaoAtual === "setor" ? "Material" : "Setor";
    table.innerHTML = `
      <thead>
        <tr>
          <th>${colunaExtra}</th>
          <th>Código</th>
          <th>Valor Unit.</th>
          <th>Qtd.</th>
          <th>Subtotal</th>
          <th>Observação</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    itens.forEach((m) => {
      const tr = document.createElement("tr");
      const valorColunaExtra = visaoAtual === "setor" ? m.nome : m.setor;
      const subtotalItem = m.valor * m.quantidade;
      tr.innerHTML = `
        <td>${escaparHtml(valorColunaExtra)}</td>
        <td>${escaparHtml(m.codigo)}</td>
        <td>R$ ${formatarMoeda(m.valor)}</td>
        <td>${m.quantidade}</td>
        <td>R$ ${formatarMoeda(subtotalItem)}</td>
        <td class="coluna-obs">${escaparHtml(m.observacao) || "—"}</td>
        <td>
          <button class="btn-editar" data-edit-index="${m.indexOriginal}">Editar</button>
          <button class="btn-excluir-item" data-delete-index="${m.indexOriginal}">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    corpo.appendChild(table);
    grupoEl.appendChild(cabecalho);
    grupoEl.appendChild(corpo);
    gruposDiv.appendChild(grupoEl);
  });

  gruposDiv.querySelectorAll("[data-edit-index]").forEach((btn) => {
    btn.addEventListener("click", () => editar(parseInt(btn.dataset.editIndex, 10)));
  });
  gruposDiv.querySelectorAll("[data-delete-index]").forEach((btn) => {
    btn.addEventListener("click", () => excluir(parseInt(btn.dataset.deleteIndex, 10)));
  });

  atualizarTotalFixo(itensFiltrados);
}

function atualizarTotalFixo(itens) {
  const totalItens = itens.length;
  const totalQuantidade = itens.reduce((soma, m) => soma + Number(m.quantidade || 0), 0);
  const totalValor = itens.reduce((soma, m) => soma + m.valor * m.quantidade, 0);

  totalItensValor.textContent = totalItens;
  totalQuantidadeValor.textContent = totalQuantidade;
  totalValorValor.textContent = `R$ ${formatarMoeda(totalValor)}`;
}

function renderTudo() {
  renderSetores();
  renderGrupos();
}

// ====================================================
// ALTERNADOR DE VISÃO
// ====================================================
btnVisaoSetor.addEventListener("click", () => {
  visaoAtual = "setor";
  btnVisaoSetor.classList.add("active");
  btnVisaoMaterial.classList.remove("active");
  gruposFechados.clear();
  renderGrupos();
});

btnVisaoMaterial.addEventListener("click", () => {
  visaoAtual = "material";
  btnVisaoMaterial.classList.add("active");
  btnVisaoSetor.classList.remove("active");
  gruposFechados.clear();
  renderGrupos();
});

// ====================================================
// FILTROS
// ====================================================
buscaInput.addEventListener("input", renderGrupos);
btnLimparFiltros.addEventListener("click", () => {
  buscaInput.value = "";
  setoresFiltroSel.clear();
  msFiltroSetor.atualizarResumo();
  renderGrupos();
});

// ====================================================
// INICIALIZAÇÃO — carrega da nuvem, migrando dados antigos do
// localStorage automaticamente na primeira vez (se a nuvem ainda
// estiver vazia). Depois da primeira migração, a nuvem manda —
// isso nunca duplica, mesmo abrindo em outro dispositivo depois.
// ====================================================
["nomeMaterial", "setorMaterial", "codigoMaterial", "valorMaterial", "quantidadeMaterial"].forEach((id) => {
  limparErroAoEditar(document.getElementById(id));
});

async function migrarSetoresSeNecessario() {
  const resposta = await apiDataGet("materiaisSetores");
  if (resposta.ok && resposta.valor && resposta.valor.length > 0) {
    return resposta.valor; // já existe na nuvem, usa isso
  }
  // Nuvem vazia — se tiver algo salvo localmente (uso anterior desta
  // página antes da migração), sobe pra nuvem agora.
  const local = JSON.parse(localStorage.getItem(CHAVE_SETORES)) || [];
  if (local.length > 0) {
    await apiDataSet("materiaisSetores", local);
    console.info(`[gestaodematerial] Migrados ${local.length} setor(es) de material do localStorage para a nuvem.`);
    return local;
  }
  return [];
}

async function migrarMateriaisSeNecessario() {
  const resposta = await apiListarMateriais();
  if (resposta.ok && resposta.materiais && resposta.materiais.length > 0) {
    return resposta.materiais; // já existe na nuvem, usa isso
  }
  // Nuvem vazia — migra o que tiver no localStorage (dados antigos,
  // de antes desta página usar a nuvem). Cada item recebe um "id"
  // novo, gerado no momento da migração.
  const local = JSON.parse(localStorage.getItem(CHAVE_MATERIAIS)) || [];
  if (local.length === 0) return [];

  const migrados = [];
  for (let i = 0; i < local.length; i++) {
    const item = local[i];
    // pequeno espaçamento no id pra garantir que cada item migrado
    // tenha um id único, mesmo migrando vários no mesmo milissegundo
    const id = String(Date.now() + i);
    const registro = { id, nome: item.nome, setor: item.setor, codigo: item.codigo, valor: item.valor, quantidade: item.quantidade, observacao: item.observacao || "" };
    const r = await apiSalvarMaterial(registro);
    if (r.ok) migrados.push(registro);
  }
  console.info(`[gestaodematerial] Migrados ${migrados.length} material(is) do localStorage para a nuvem.`);
  return migrados;
}

async function iniciarGestaoDeMaterial() {
  try {
    const [setoresCarregados, materiaisCarregados] = await Promise.all([
      migrarSetoresSeNecessario(),
      migrarMateriaisSeNecessario(),
    ]);
    setores = setoresCarregados;
    materiais = materiaisCarregados;
  } catch (e) {
    console.error("[gestaodematerial] Erro ao carregar dados da nuvem:", e);
    mostrarToast("Não foi possível carregar os materiais. Verifique sua conexão e recarregue a página.", "erro");
  }
  renderTudo();
  renderPendentesMateriais();
}

iniciarGestaoDeMaterial();