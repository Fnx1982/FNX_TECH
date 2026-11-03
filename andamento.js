// ============================================================
// andamento.js
// Mostra propostas com status "andamento" ou "finalizada"
// (ambas têm status === "andamento" ou "finalizada" no campo
// status principal, refletindo statusExecucao). A aba ativa
// filtra entre as duas.
// ============================================================

const listaPropostasEl = document.getElementById("listaPropostas");
const semResultadosEl = document.getElementById("semResultados");
const buscaInput = document.getElementById("buscaTexto");
const filtroMes = document.getElementById("filtroMes");
const filtroAno = document.getElementById("filtroAno");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");
const abasStatus = document.querySelectorAll("[data-status-aba]");

const NOMES_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

let abaAtiva = "andamento";

function propostasDestaPagina() {
  return lerPropostas().filter((p) => (p.status === "andamento" || p.status === "finalizada") && !p.lixeiraObra);
}

function popularFiltrosMesAno() {
  const todas = propostasDestaPagina();
  const anos = [...new Set(todas.map((p) => new Date(p.criadoEm).getFullYear()))].sort((a, b) => b - a);

  const mesAtual = filtroMes.value;
  filtroMes.innerHTML = '<option value="todos">Todos</option>';
  NOMES_MESES.forEach((nome, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = nome;
    filtroMes.appendChild(opt);
  });
  filtroMes.value = mesAtual || "todos";

  const anoAtual = filtroAno.value;
  filtroAno.innerHTML = '<option value="todos">Todos</option>';
  anos.forEach((ano) => {
    const opt = document.createElement("option");
    opt.value = String(ano);
    opt.textContent = ano;
    filtroAno.appendChild(opt);
  });
  filtroAno.value = anoAtual || "todos";
}

function aplicarFiltros() {
  const termo = buscaInput.value.trim().toLowerCase();
  const mesSel = filtroMes.value;
  const anoSel = filtroAno.value;

  return propostasDestaPagina().filter((p) => {
    const data = new Date(p.criadoEm);
    const buscaOK =
      termo === "" ||
      (p.cliente || "").toLowerCase().includes(termo) ||
      (p.local || "").toLowerCase().includes(termo) ||
      (p.servico || "").toLowerCase().includes(termo) ||
      nomeResponsavelProposta(p).toLowerCase().includes(termo);
    const mesOK = mesSel === "todos" || data.getMonth() === parseInt(mesSel, 10);
    const anoOK = anoSel === "todos" || data.getFullYear() === parseInt(anoSel, 10);
    const abaOK = p.status === abaAtiva;
    return buscaOK && mesOK && anoOK && abaOK;
  });
}

function renderLista() {
  popularFiltrosMesAno();
  const itens = aplicarFiltros().sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));
  listaPropostasEl.innerHTML = "";

  if (itens.length === 0) {
    semResultadosEl.style.display = "block";
    return;
  }
  semResultadosEl.style.display = "none";

  itens.forEach((p) => {
    const card = document.createElement("div");
    card.className = `proposta-card status-${corStatus(p)}`;
    const dataFormatada = new Date(p.criadoEm).toLocaleDateString("pt-BR");
    const numOrc = p.numeroOrcamento ? `<span style="font-size:11px;color:#888;font-weight:600;">Nº ${escaparHtml(p.numeroOrcamento)}</span>` : "";

    // Status de obra independente do status da proposta
    const statusObraAtual = p.statusObra || (p.status === "finalizada" ? "finalizada" : "andamento");
    const seloObra = statusObraAtual === "finalizada"
      ? `<span style="background:#E8F5EF;color:#1c8a4b;font-size:10px;font-weight:700;padding:2px 9px;border-radius:12px;text-transform:uppercase;">✓ Finalizada</span>`
      : `<span style="background:#EBF2FB;color:#2B6CB0;font-size:10px;font-weight:700;padding:2px 9px;border-radius:12px;text-transform:uppercase;">⚙ Em Andamento</span>`;

    const botaoStatusObra = statusObraAtual !== "finalizada"
      ? `<button class="btn-finalizar" data-finalizar-obra="${p.id}">Finalizar Obra</button>`
      : `<button class="btn-andamento" data-reabrir-obra="${p.id}">Reabrir Obra</button>`;

    const botaoNfe = propostaTemMateriais(p)
      ? `<button class="btn-gerar-nota" data-nfe-id="${p.id}">NF-e</button>`
      : "";
    const botaoNfse = propostaTemMaoDeObra(p)
      ? `<button class="btn-gerar-nota" data-nfse-id="${p.id}">NFS-e</button>`
      : "";

    card.innerHTML = `
      <div class="proposta-topo">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="proposta-cliente">${escaparHtml(p.cliente) || "(sem nome do cliente)"}</div>
            ${numOrc}
          </div>
          <div class="proposta-servico">${escaparHtml(p.servico) || ""}</div>
          ${p.local && typeof htmlLinksMapa === "function" ? `<div class="endereco-com-mapa"><span class="texto-endereco">📍 ${escaparHtml(p.local)}</span>${htmlLinksMapa(p.local)}</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="selo-status ${corStatus(p)}">${rotuloStatus(p)}</span>
          ${seloObra}
        </div>
      </div>
      <div class="proposta-meta">
        <span>Criado em ${dataFormatada}${nomeResponsavelProposta(p) ? ` · 👤 ${escaparHtml(nomeResponsavelProposta(p))}` : ""}</span>
        <span class="proposta-total">Total: R$ ${formatarMoeda(totalGeral(p))}</span>
      </div>
      <div class="proposta-acoes">
        <button class="btn-pdf" data-pdf-id="${p.id}" title="Só com as observações para o cliente">PDF Cliente</button>
        <button class="btn-pdf-interno" data-pdf-interno-id="${p.id}" title="Com impostos e observações internas — não enviar ao cliente">PDF Interno</button>
        <button class="btn-pdf-descritivo" data-pdf-desc-id="${p.id}" title="Só os itens e condições, sem nenhum valor — pro cliente entender o que está incluso">PDF Descritivo</button>
        <button class="btn-editar" data-edit-id="${p.id}">Editar</button>
        ${botaoNfe}
        ${botaoNfse}
        ${botaoStatusObra}
        <button class="btn-negar" data-reverter-id="${p.id}">Voltar para Análise</button>
        <button class="btn-excluir-item" data-delete-id="${p.id}">Excluir</button>
      </div>
    `;
    listaPropostasEl.appendChild(card);
  });

  listaPropostasEl.querySelectorAll("[data-pdf-id]").forEach((btn) => {
    btn.addEventListener("click", () => gerarPdfProposta(buscarProposta(btn.dataset.pdfId), "cliente"));
  });
  listaPropostasEl.querySelectorAll("[data-pdf-desc-id]").forEach((btn) => {
    btn.addEventListener("click", () => gerarPdfProposta(buscarProposta(btn.dataset.pdfDescId), "descritivo"));
  });
  listaPropostasEl.querySelectorAll("[data-pdf-interno-id]").forEach((btn) => {
    btn.addEventListener("click", () => gerarPdfProposta(buscarProposta(btn.dataset.pdfInternoId), "interno"));
  });
  listaPropostasEl.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => abrirFormularioProposta(btn.dataset.editId, renderLista));
  });
  listaPropostasEl.querySelectorAll("[data-nfe-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = buscarProposta(btn.dataset.nfeId);
      if (p) navegarParaNotaAndamento(linkParaNfe(p));
    });
  });
  listaPropostasEl.querySelectorAll("[data-nfse-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = buscarProposta(btn.dataset.nfseId);
      if (p) navegarParaNotaAndamento(linkParaNfse(p));
    });
  });
  listaPropostasEl.querySelectorAll("[data-finalizar-obra]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Finalizar esta obra?", "O status vai para 'Finalizada'.");
      if (!confirmado) return;
      const p = buscarProposta(btn.dataset.finalizarObra);
      if (p) { p.statusObra = "finalizada"; p.status = "finalizada"; salvarProposta(p); }
      renderLista();
    });
  });
  listaPropostasEl.querySelectorAll("[data-reabrir-obra]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Reabrir esta obra?", "O status volta para 'Em Andamento'.");
      if (!confirmado) return;
      const p = buscarProposta(btn.dataset.reabrirObra);
      if (p) { p.statusObra = "andamento"; p.status = "andamento"; salvarProposta(p); }
      renderLista();
    });
  });
  listaPropostasEl.querySelectorAll("[data-reverter-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Voltar para Análise?", "A aprovação será desfeita.");
      if (!confirmado) return;
      reverterParaAnalise(btn.dataset.reverterId);
      renderLista();
    });
  });
  listaPropostasEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Excluir obra?", "Essa ação não pode ser desfeita.");
      if (!confirmado) return;
      await excluirProposta(btn.dataset.deleteId);
      renderLista();
    });
  });
}

abasStatus.forEach((aba) => {
  aba.addEventListener("click", () => {
    abasStatus.forEach((a) => a.classList.remove("active"));
    aba.classList.add("active");
    abaAtiva = aba.dataset.statusAba;
    renderLista();
  });
});

buscaInput.addEventListener("input", renderLista);
filtroMes.addEventListener("change", renderLista);
filtroAno.addEventListener("change", renderLista);
btnLimparFiltros.addEventListener("click", () => {
  buscaInput.value = "";
  filtroMes.value = "todos";
  filtroAno.value = "todos";
  renderLista();
});

renderLista();

function navegarParaNotaAndamento(url) {
  window.location.href = url;
}
carregarObrasCache();

// Orçamentos chegaram da nuvem: redesenha a lista
document.addEventListener("propostas-carregadas", () => renderLista());
