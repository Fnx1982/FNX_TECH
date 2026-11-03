// ============================================================
// clientes-crm.js
// Quadro de clientes estilo Kanban — colunas personalizáveis,
// cartões arrastáveis, busca, e um botão que abre o WhatsApp
// direto na conversa da pessoa (numa aba nova).
// ============================================================

let colunasCrm = [];
let clientesCrm = [];
let colunaIdParaNovoCartao = null; // qual coluna o botão "+ Adicionar cliente" abriu
let clienteIdEmEdicao = null;
let idArrastando = null;

const quadroCrmEl = document.getElementById("quadroCrm");
const buscaCrmEl = document.getElementById("buscaCrm");
const modalClienteCrm = document.getElementById("modalClienteCrm");

// ── Telefone → link do WhatsApp ─────────────────────────────
function linkWhatsApp(telefone) {
  let digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return null;
  // Sem código do país ainda (número brasileiro típico, 10 ou 11
  // dígitos) — adiciona o 55 na frente.
  if (digitos.length <= 11) digitos = "55" + digitos;
  return `https://wa.me/${digitos}`;
}

// Mesma máscara de telefone usada no resto do site — (99) 9 9999-9999
function aplicarMascaraTelefoneCrm(event) {
  let input = event.target;
  let valor = input.value.replace(/\D/g, "");
  if (valor.length > 11) valor = valor.slice(0, 11);
  if (valor.length > 7) valor = valor.replace(/^(\d{2})(\d{1})(\d{4})(\d{0,4}).*/, "($1) $2 $3-$4");
  else if (valor.length > 3) valor = valor.replace(/^(\d{2})(\d{1})(\d{0,4})/, "($1) $2 $3");
  else if (valor.length > 2) valor = valor.replace(/^(\d{2})(\d{0,1})/, "($1) $2");
  else if (valor.length > 0) valor = valor.replace(/^(\d{0,2})/, "($1");
  input.value = valor.trim();
}
document.getElementById("crmCampoTelefone").addEventListener("input", aplicarMascaraTelefoneCrm);

// ── Carregamento ─────────────────────────────────────────────
async function carregarQuadro() {
  const [respColunas, respClientes] = await Promise.all([apiListarColunasCrm(), apiListarClientesCrm()]);
  colunasCrm = respColunas.ok ? respColunas.colunas : [];
  clientesCrm = respClientes.ok ? respClientes.clientes : [];
  renderQuadro();
}

function popularSelectColunas() {
  const select = document.getElementById("crmCampoColuna");
  select.innerHTML = colunasCrm.map((c) => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join("");
}

// ── Renderização ──────────────────────────────────────────────
function renderQuadro() {
  const termo = buscaCrmEl.value.trim().toLowerCase();
  const clientesFiltrados = termo
    ? clientesCrm.filter((c) => (c.nome || "").toLowerCase().includes(termo) || (c.telefone || "").includes(termo))
    : clientesCrm;

  quadroCrmEl.innerHTML = colunasCrm.map((coluna) => {
    const cartoesDaColuna = clientesFiltrados.filter((c) => c.colunaId === coluna.id);
    return `
      <div class="coluna-crm" data-coluna-id="${coluna.id}">
        <div class="cabecalho-coluna">
          <input type="text" class="nome-coluna-input" value="${escaparHtml(coluna.nome)}" data-coluna-nome="${coluna.id}" />
          <span class="contador-coluna">${cartoesDaColuna.length}</span>
          <button type="button" class="btn-excluir-coluna" data-excluir-coluna="${coluna.id}" title="Excluir coluna">✕</button>
        </div>
        <div class="lista-cartoes-coluna" data-lista-coluna="${coluna.id}">
          ${cartoesDaColuna.length === 0 ? '<div class="coluna-vazia-msg">Nenhum cliente aqui</div>' : ""}
          ${cartoesDaColuna.map((c) => cartaoHtml(c)).join("")}
        </div>
        <button type="button" class="btn-add-cartao" data-add-cartao="${coluna.id}">+ Adicionar cliente</button>
      </div>
    `;
  }).join("");

  ligarEventosQuadro();
}

function cartaoHtml(c) {
  const wa = linkWhatsApp(c.telefone);
  return `
    <div class="cartao-crm" draggable="true" data-cartao-id="${c.id}">
      <div class="cartao-crm-nome">${escaparHtml(c.nome)}</div>
      ${c.telefone ? `<div class="cartao-crm-telefone">${escaparHtml(c.telefone)}</div>` : ""}
      ${c.observacao ? `<div class="cartao-crm-observacao">${escaparHtml(c.observacao)}</div>` : ""}
      <div class="cartao-crm-acoes">
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="btn-whatsapp-crm">WhatsApp</a>` : ""}
        <button type="button" class="btn-editar-crm" data-editar-cartao="${c.id}">Editar</button>
        <button type="button" class="btn-excluir-crm" data-excluir-cartao="${c.id}">Excluir</button>
      </div>
    </div>
  `;
}

// ── Eventos (recriados a cada render) ───────────────────────
function ligarEventosQuadro() {
  // Nome da coluna editável — salva ao sair do campo
  quadroCrmEl.querySelectorAll("[data-coluna-nome]").forEach((input) => {
    input.addEventListener("change", async () => {
      const coluna = colunasCrm.find((c) => c.id === input.dataset.colunaNome);
      coluna.nome = input.value.trim() || coluna.nome;
      input.value = coluna.nome;
      await apiSalvarColunasCrm(colunasCrm);
      popularSelectColunas();
    });
  });

  quadroCrmEl.querySelectorAll("[data-excluir-coluna]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.excluirColuna;
      const temCartoes = clientesCrm.some((c) => c.colunaId === id);
      const msg = temCartoes
        ? "Essa coluna tem clientes dentro. Excluir a coluna também apaga os clientes que estão nela. Continuar?"
        : "Excluir esta coluna?";
      const ok = await confirmarAcao(msg, "Essa ação não pode ser desfeita.");
      if (!ok) return;

      colunasCrm = colunasCrm.filter((c) => c.id !== id);
      await apiSalvarColunasCrm(colunasCrm);

      const paraExcluir = clientesCrm.filter((c) => c.colunaId === id);
      await Promise.all(paraExcluir.map((c) => apiExcluirClienteCrm(c.id)));
      clientesCrm = clientesCrm.filter((c) => c.colunaId !== id);

      popularSelectColunas();
      renderQuadro();
    });
  });

  quadroCrmEl.querySelectorAll("[data-add-cartao]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCliente(null, btn.dataset.addCartao));
  });
  quadroCrmEl.querySelectorAll("[data-editar-cartao]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCliente(btn.dataset.editarCartao));
  });
  quadroCrmEl.querySelectorAll("[data-excluir-cartao]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir este cliente do quadro?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await apiExcluirClienteCrm(btn.dataset.excluirCartao);
      clientesCrm = clientesCrm.filter((c) => c.id !== btn.dataset.excluirCartao);
      renderQuadro();
    });
  });

  // Arrastar e soltar entre colunas
  quadroCrmEl.querySelectorAll(".cartao-crm").forEach((cartao) => {
    cartao.addEventListener("dragstart", () => {
      idArrastando = cartao.dataset.cartaoId;
      cartao.classList.add("dragging");
    });
    cartao.addEventListener("dragend", () => cartao.classList.remove("dragging"));
  });

  quadroCrmEl.querySelectorAll(".coluna-crm").forEach((colunaEl) => {
    colunaEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      colunaEl.classList.add("drag-over");
    });
    colunaEl.addEventListener("dragleave", () => colunaEl.classList.remove("drag-over"));
    colunaEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      colunaEl.classList.remove("drag-over");
      if (!idArrastando) return;
      const novaColunaId = colunaEl.dataset.colunaId;
      const cliente = clientesCrm.find((c) => c.id === idArrastando);
      if (!cliente || cliente.colunaId === novaColunaId) return;
      cliente.colunaId = novaColunaId;
      renderQuadro(); // resposta visual imediata
      await apiSalvarClienteCrm(cliente);
      idArrastando = null;
    });
  });
}

// ── Nova coluna ──────────────────────────────────────────────
const modalNovaColuna = document.getElementById("modalNovaColuna");
document.getElementById("btnNovaColuna").addEventListener("click", () => {
  document.getElementById("campoNomeNovaColuna").value = "";
  modalNovaColuna.classList.add("active");
  document.getElementById("campoNomeNovaColuna").focus();
});
document.getElementById("fecharModalNovaColuna").addEventListener("click", () => modalNovaColuna.classList.remove("active"));
modalNovaColuna.addEventListener("click", (e) => { if (e.target === modalNovaColuna) modalNovaColuna.classList.remove("active"); });

document.getElementById("formNovaColuna").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("campoNomeNovaColuna").value.trim();
  if (!nome) return;
  colunasCrm.push({ id: "col_" + Date.now(), nome });
  await apiSalvarColunasCrm(colunasCrm);
  popularSelectColunas();
  renderQuadro();
  modalNovaColuna.classList.remove("active");
});

// ── Modal de cliente ─────────────────────────────────────────
function abrirModalCliente(clienteId, colunaPreSelecionada) {
  clienteIdEmEdicao = clienteId;
  popularSelectColunas();
  const form = document.getElementById("formClienteCrm");
  form.reset();

  if (clienteId) {
    const c = clientesCrm.find((x) => x.id === clienteId);
    document.getElementById("tituloModalClienteCrm").textContent = "Editar Cliente";
    document.getElementById("crmClienteId").value = c.id;
    document.getElementById("crmCampoNome").value = c.nome || "";
    document.getElementById("crmCampoTelefone").value = c.telefone || "";
    document.getElementById("crmCampoColuna").value = c.colunaId;
    document.getElementById("crmCampoObservacao").value = c.observacao || "";
  } else {
    document.getElementById("tituloModalClienteCrm").textContent = "Novo Cliente";
    document.getElementById("crmClienteId").value = "";
    if (colunaPreSelecionada) document.getElementById("crmCampoColuna").value = colunaPreSelecionada;
  }
  modalClienteCrm.classList.add("active");
}
function fecharModalCliente() { modalClienteCrm.classList.remove("active"); }

document.getElementById("fecharModalClienteCrm").addEventListener("click", fecharModalCliente);
modalClienteCrm.addEventListener("click", (e) => { if (e.target === modalClienteCrm) fecharModalCliente(); });

document.getElementById("formClienteCrm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = {
    id: document.getElementById("crmClienteId").value || null,
    nome: document.getElementById("crmCampoNome").value.trim(),
    telefone: document.getElementById("crmCampoTelefone").value.trim(),
    colunaId: document.getElementById("crmCampoColuna").value,
    observacao: document.getElementById("crmCampoObservacao").value.trim(),
  };
  if (!dados.nome) return;

  const resposta = await apiSalvarClienteCrm(dados);
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar cliente.", "erro"); return; }

  if (dados.id) {
    const idx = clientesCrm.findIndex((c) => c.id === dados.id);
    if (idx !== -1) clientesCrm[idx] = resposta.cliente;
  } else {
    clientesCrm.push(resposta.cliente);
  }
  fecharModalCliente();
  renderQuadro();
});

// ── Busca ────────────────────────────────────────────────────
buscaCrmEl.addEventListener("input", renderQuadro);

// ── Inicialização ────────────────────────────────────────────
carregarQuadro();