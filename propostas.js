// ============================================================
// propostas.js
// Mostra propostas com status "analise" ou "negada". Aprovar
// muda o status para "andamento" automaticamente, fazendo o item
// sair desta lista e aparecer em andamento.html.
// ============================================================

const STATUS_DESTA_PAGINA = ["analise", "negada"];

const listaPropostasEl = document.getElementById("listaPropostas");
const semResultadosEl = document.getElementById("semResultados");
const buscaInput = document.getElementById("buscaTexto");
const filtroMes = document.getElementById("filtroMes");
const filtroAno = document.getElementById("filtroAno");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");
const abasStatus = document.querySelectorAll("[data-status-aba]");

const NOMES_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

let abaAtiva = "todos";

function propostasDestaPagina() {
  return lerPropostas().filter((p) => STATUS_DESTA_PAGINA.includes(p.status));
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
    const abaOK = abaAtiva === "todos" || p.status === abaAtiva;
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

    const botoesStatus =
      p.status === "negada"
        ? `<button class="btn-aprovar" data-aprovar-id="${p.id}">Aprovar</button>`
        : `<button class="btn-aprovar" data-aprovar-id="${p.id}">Aprovar</button>
           <button class="btn-negar" data-negar-id="${p.id}">Negar</button>`;

    card.innerHTML = `
      <div class="proposta-topo">
        <div>
          <div class="proposta-cliente">${escaparHtml(p.cliente) || "(sem nome do cliente)"}</div>
          <div class="proposta-servico">${escaparHtml(p.servico) || ""}</div>
          ${p.local && typeof htmlLinksMapa === "function" ? `<div class="endereco-com-mapa"><span class="texto-endereco">📍 ${escaparHtml(p.local)}</span>${htmlLinksMapa(p.local)}</div>` : ""}
        </div>
        <span class="selo-status ${corStatus(p)}">${rotuloStatus(p)}</span>
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
        ${botoesStatus}
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
  listaPropostasEl.querySelectorAll("[data-aprovar-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Aprovar esta proposta?", "Ela vai para 'Em Andamento' automaticamente.");
      if (!confirmado) return;
      await mudarStatusProposta(btn.dataset.aprovarId, "aprovada");
      renderLista();
    });
  });
  listaPropostasEl.querySelectorAll("[data-negar-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Negar esta proposta?", "Ela ficará marcada como negada.");
      if (!confirmado) return;
      await mudarStatusProposta(btn.dataset.negarId, "negada");
      renderLista();
    });
  });
  listaPropostasEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Excluir proposta?", "Essa ação não pode ser desfeita.");
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
// Carrega o cache de Obras em segundo plano — precisa estar pronto
// antes de aprovar/excluir uma proposta (evita duplicar obra se
// aprovar duas vezes rápido, por exemplo).
carregarObrasCache();

// Orçamentos chegaram da nuvem: redesenha a lista
document.addEventListener("propostas-carregadas", () => renderLista());
