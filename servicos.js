// ============================================================
// servicos.js — cadastro de serviços/mão de obra (modal, dentro
// de gestaodematerial.html, aba "Serviços"), com os códigos
// fiscais usados na emissão de NFS-e.
// ============================================================

let servicoEmEdicaoId = null;
let servicosCache = [];
let rascunhoAtualId = null; // id do rascunho de auto-save em andamento (null = ainda não criado)

const modalServico = document.getElementById("modalServico");
const btnAbrirServico = document.getElementById("btnAbrirServico");
const fecharModalServicoBtn = document.getElementById("fecharModalServico");
const tituloFormularioServico = document.getElementById("tituloFormulario");
const btnSalvarServicoEl = document.getElementById("btnSalvarServico");
const btnCancelarEdicaoServico = document.getElementById("btnCancelarEdicao");

// ── Abrir / fechar modal ──────────────────────────────────────
function abrirModalServico() {
  modalServico.classList.add("active");
}
function fecharModalServico() {
  modalServico.classList.remove("active");
  // Fechar NÃO apaga o rascunho — ele continua "Pendente" até o
  // usuário voltar e finalizar de verdade (mesmo comportamento das
  // outras telas com auto-save).
  rascunhoAtualId = null;
  renderPendentesServicos();
}

btnAbrirServico.addEventListener("click", () => {
  limparFormularioServico();
  abrirModalServico();
});

// Botão que aparece quando a busca não acha nada — abre o mesmo
// modal de sempre (com LC116, CNAE, etc.), já com o nome preenchido.
document.getElementById("btnCadastrarServicoDaBusca").addEventListener("click", () => {
  const termo = document.getElementById("buscaServicos").value.trim();
  limparFormularioServico();
  document.getElementById("campoNome").value = termo;
  abrirModalServico();
});

fecharModalServicoBtn.addEventListener("click", fecharModalServico);
btnCancelarEdicaoServico.addEventListener("click", fecharModalServico);
modalServico.addEventListener("click", (e) => { if (e.target === modalServico) fecharModalServico(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalServico.classList.contains("active")) fecharModalServico();
});

// ── Campos extras (livres, key/valor) ────────────────────────────
function adicionarLinhaExtra(campo) {
  campo = campo || { nome: "", valor: "" };
  const container = document.getElementById("listaCamposExtras");
  const linha = document.createElement("div");
  linha.style.cssText = "display:flex; gap:8px;";
  linha.innerHTML = `
    <input type="text" class="extra-nome" placeholder="Nome do código" value="${escaparHtml(campo.nome || "")}" style="flex:1;" />
    <input type="text" class="extra-valor" placeholder="Valor" value="${escaparHtml(campo.valor || "")}" style="flex:1;" />
    <button type="button" class="btn-remover-linha" style="background:none;border:none;color:#E5141B;cursor:pointer;font-size:16px;">✕</button>
  `;
  linha.querySelector(".btn-remover-linha").addEventListener("click", () => linha.remove());
  container.appendChild(linha);
}

function lerCamposExtras() {
  return [...document.querySelectorAll("#listaCamposExtras > div")]
    .map((linha) => ({ nome: linha.querySelector(".extra-nome").value.trim(), valor: linha.querySelector(".extra-valor").value.trim() }))
    .filter((c) => c.nome);
}

document.getElementById("btnAddCampoExtra").addEventListener("click", () => adicionarLinhaExtra());

function limparFormularioServico() {
  servicoEmEdicaoId = null;
  rascunhoAtualId = null;
  document.getElementById("campoId").value = "";
  ["campoNome", "campoValor", "campoCodigoLC116", "campoCnae", "campoAliquotaIss", "campoObservacao"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("campoUnidade").value = "UND";
  document.getElementById("listaCamposExtras").innerHTML = "";
  if (typeof preencherFiscalServico === "function") preencherFiscalServico({});
  tituloFormularioServico.textContent = "Novo serviço";
  btnCancelarEdicaoServico.style.display = "none";
}

function preencherFormularioServico(servico) {
  servicoEmEdicaoId = servico.id;
  rascunhoAtualId = null;
  document.getElementById("campoId").value = servico.id;
  document.getElementById("campoNome").value = servico.nome || "";
  document.getElementById("campoValor").value = servico.valor || "";
  document.getElementById("campoUnidade").value = servico.unidade || "UND";
  document.getElementById("campoCodigoLC116").value = servico.codigoServicoLC116 || "";
  document.getElementById("campoCnae").value = servico.cnae || "";
  document.getElementById("campoAliquotaIss").value = servico.aliquotaIss ?? "";
  document.getElementById("campoObservacao").value = servico.observacao || "";
  document.getElementById("listaCamposExtras").innerHTML = "";
  (servico.camposAdicionais || []).forEach((c) => adicionarLinhaExtra(c));
  if (typeof preencherFiscalServico === "function") preencherFiscalServico(servico.fiscal);
  tituloFormularioServico.textContent = `Editando — ${servico.nome}`;
  btnCancelarEdicaoServico.style.display = "inline-block";
  abrirModalServico();
}

// ====================================================
// RASCUNHO AUTOMÁTICO (auto-save) — só salva enquanto o modal
// estiver realmente aberto, pra não disparar save de campos
// escondidos com valor residual de uma edição anterior.
// ====================================================
function coletarDadosRascunhoServico() {
  const aliquota = document.getElementById("campoAliquotaIss").value;
  return {
    id: servicoEmEdicaoId,
    nome: document.getElementById("campoNome").value.trim(),
    valor: document.getElementById("campoValor").value ? Number(document.getElementById("campoValor").value) : 0,
    unidade: document.getElementById("campoUnidade").value.trim().toUpperCase() || "UND",
    codigoServicoLC116: document.getElementById("campoCodigoLC116").value.trim(),
    cnae: document.getElementById("campoCnae").value.trim(),
    aliquotaIss: aliquota === "" ? null : Number(aliquota),
    observacao: document.getElementById("campoObservacao").value.trim(),
    camposAdicionais: lerCamposExtras(),
    fiscal: typeof lerFiscalServico === "function" ? lerFiscalServico() : undefined,
  };
}

function formularioServicoTemConteudo(d) {
  return !!(d.nome || d.valor || d.codigoServicoLC116 || d.cnae || d.aliquotaIss !== null || d.observacao || (d.camposAdicionais && d.camposAdicionais.length));
}

async function salvarRascunhoAtual() {
  if (!modalServico.classList.contains("active")) return;
  const dados = coletarDadosRascunhoServico();
  if (!formularioServicoTemConteudo(dados)) return;
  const resposta = await apiSalvarRascunho("servico", rascunhoAtualId, dados);
  if (resposta.ok) { rascunhoAtualId = resposta.id; renderPendentesServicos(); }
}

function salvarRascunhoAtualImediato() {
  if (!modalServico.classList.contains("active")) return;
  const dados = coletarDadosRascunhoServico();
  if (!formularioServicoTemConteudo(dados)) return;
  if (!rascunhoAtualId) rascunhoAtualId = `rascunho_servico_${Date.now()}`;
  apiSalvarRascunhoImediato("servico", rascunhoAtualId, dados);
}

["campoNome", "campoValor", "campoCodigoLC116", "campoCnae", "campoAliquotaIss", "campoObservacao"].forEach((idCampo) => {
  document.getElementById(idCampo).addEventListener("blur", salvarRascunhoAtual);
});
document.getElementById("campoUnidade").addEventListener("change", salvarRascunhoAtual);
document.getElementById("listaCamposExtras").addEventListener("focusout", salvarRascunhoAtual);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") salvarRascunhoAtualImediato(); });
window.addEventListener("beforeunload", salvarRascunhoAtualImediato);

function continuarRascunhoServico(dados, idRascunho) {
  rascunhoAtualId = idRascunho;
  servicoEmEdicaoId = dados.id || null;
  document.getElementById("campoId").value = dados.id || "";
  document.getElementById("campoNome").value = dados.nome || "";
  document.getElementById("campoValor").value = dados.valor || "";
  document.getElementById("campoUnidade").value = dados.unidade || "UND";
  document.getElementById("campoCodigoLC116").value = dados.codigoServicoLC116 || "";
  document.getElementById("campoCnae").value = dados.cnae || "";
  document.getElementById("campoAliquotaIss").value = dados.aliquotaIss ?? "";
  document.getElementById("campoObservacao").value = dados.observacao || "";
  document.getElementById("listaCamposExtras").innerHTML = "";
  (dados.camposAdicionais || []).forEach((c) => adicionarLinhaExtra(c));
  if (typeof preencherFiscalServico === "function") preencherFiscalServico(dados.fiscal);
  tituloFormularioServico.textContent = dados.nome ? `Continuando rascunho — ${dados.nome}` : "Continuando rascunho";
  btnCancelarEdicaoServico.style.display = "inline-block";
  abrirModalServico();
}

async function renderPendentesServicos() {
  const bloco = document.getElementById("blocoPendentesServicos");
  const listaEl = document.getElementById("listaPendentesServicos");
  if (!bloco || !listaEl) return;
  const resposta = await apiListarRascunhos("servico");
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
        <div class="nome">${escaparHtml(d.nome) || "(sem descrição)"} <span class="badge-tipo" style="background:#FFF1E6;color:#8A3300;">Pendente</span></div>
        <div class="meta">Salvo automaticamente em ${dataFormatada}</div>
      </div>
      <div class="acoes">
        <button class="btn-editar-servico">Continuar editando</button>
        <button class="btn-excluir-servico">Excluir</button>
      </div>
    `;
    el.querySelector(".btn-editar-servico").addEventListener("click", () => continuarRascunhoServico(d, r.id));
    el.querySelector(".btn-excluir-servico").addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir rascunho pendente?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await apiExcluirRascunho("servico", r.id);
      renderPendentesServicos();
    });
    listaEl.appendChild(el);
  });
}

// ── Salvar de verdade ─────────────────────────────────────────
btnSalvarServicoEl.addEventListener("click", async () => {
  const nome = document.getElementById("campoNome").value.trim();
  if (!nome) { mostrarToast("Informe a descrição do serviço.", "erro"); return; }

  const textoOriginal = btnSalvarServicoEl.textContent;
  btnSalvarServicoEl.disabled = true;

  try {
    const dados = coletarDadosRascunhoServico();
    const resposta = await apiSalvarServico(dados);
    if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar.", "erro"); return; }
    mostrarToast("Serviço salvo.");
    if (rascunhoAtualId) { await apiExcluirRascunho("servico", rascunhoAtualId); rascunhoAtualId = null; }
    limparFormularioServico();
    modalServico.classList.remove("active");
    carregarServicos();
    renderPendentesServicos();
  } finally {
    btnSalvarServicoEl.disabled = false;
    btnSalvarServicoEl.textContent = textoOriginal;
  }
});

// ── Listar / buscar / excluir ────────────────────────────────────
async function carregarServicos() {
  const resposta = await apiListarServicos();
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao carregar serviços.", "erro"); return; }
  servicosCache = resposta.servicos;
  renderizarListaServicos();
}

function renderizarListaServicos() {
  const busca = document.getElementById("buscaServicos").value.trim().toLowerCase();
  let filtrados = servicosCache;
  if (busca) {
    filtrados = filtrados.filter((s) =>
      (s.nome || "").toLowerCase().includes(busca) ||
      (s.codigoServicoLC116 || "").toLowerCase().includes(busca) ||
      (s.cnae || "").toLowerCase().includes(busca)
    );
  }

  const lista = document.getElementById("listaServicos");
  const vazio = document.getElementById("vazioServicos");
  lista.innerHTML = "";

  if (filtrados.length === 0) {
    vazio.style.display = "block";
    const btnCadastrar = document.getElementById("btnCadastrarServicoDaBusca");
    const textoVazio = document.getElementById("vazioServicosTexto");
    if (busca) {
      textoVazio.textContent = `Nenhum serviço encontrado pra "${busca}".`;
      btnCadastrar.textContent = `+ Cadastrar "${document.getElementById("buscaServicos").value.trim()}" como serviço novo`;
      btnCadastrar.style.display = "inline-block";
    } else {
      textoVazio.textContent = "Nenhum serviço cadastrado ainda.";
      btnCadastrar.style.display = "none";
    }
    return;
  }
  vazio.style.display = "none";

  filtrados.forEach((s) => {
    const el = document.createElement("div");
    el.className = "item-contato";
    const valorFmt = s.valor ? Number(s.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
    const partesMeta = [s.codigoServicoLC116 ? "LC116 " + s.codigoServicoLC116 : "LC116 não informado", s.unidade];
    if (s.cnae) partesMeta.push("CNAE " + s.cnae);
    if (s.aliquotaIss !== null && s.aliquotaIss !== undefined) partesMeta.push("ISS " + s.aliquotaIss + "%");
    if (valorFmt) partesMeta.push(valorFmt);
    el.innerHTML = `
      <div>
        <div class="nome">${escaparHtml(s.nome)}</div>
        <div class="meta">${escaparHtml(partesMeta.join(" · "))}</div>
      </div>
      <div class="acoes">
        <button class="btn-editar">Editar</button>
        <button class="btn-excluir-item">Excluir</button>
      </div>
    `;
    el.querySelector(".btn-editar").addEventListener("click", () => preencherFormularioServico(s));
    el.querySelector(".btn-excluir-item").addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir "${s.nome}"?`, "");
      if (!ok) return;
      const resp = await apiExcluirServico(s.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
      mostrarToast("Excluído.");
      carregarServicos();
    });
    lista.appendChild(el);
  });
}

document.getElementById("buscaServicos").addEventListener("input", renderizarListaServicos);

carregarServicos();
renderPendentesServicos();