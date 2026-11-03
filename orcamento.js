// ============================================================
// orcamento.js
// Mostra apenas propostas com status === "orcamento".
// Ao enviar para análise, o status muda e o item desaparece
// desta lista, passando a aparecer em propostas.html.
// ============================================================

const STATUS_DESTA_PAGINA = ["orcamento"];

const listaPropostasEl = document.getElementById("listaPropostas");
const semResultadosEl = document.getElementById("semResultados");
const buscaInput = document.getElementById("buscaTexto");
const filtroMes = document.getElementById("filtroMes");
const filtroAno = document.getElementById("filtroAno");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");
const btnNovoOrcamento = document.getElementById("btnNovoOrcamento");

const NOMES_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

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
    return buscaOK && mesOK && anoOK;
  });
}

function renderLista() {
  popularFiltrosMesAno();
  const itens = aplicarFiltros().sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
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
        <button class="btn-aprovar" data-enviar-id="${p.id}">Enviar para Análise</button>
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
  listaPropostasEl.querySelectorAll("[data-enviar-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Enviar para análise?", "O orçamento vai para a aba Análise, onde pode ser aprovado ou negado.");
      if (!confirmado) return;
      await mudarStatusProposta(btn.dataset.enviarId, "analise");
      renderLista();
    });
  });
  listaPropostasEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmado = await confirmarAcao("Excluir orçamento?", "Essa ação não pode ser desfeita.");
      if (!confirmado) return;
      await excluirProposta(btn.dataset.deleteId);
      renderLista();
    });
  });
}

btnNovoOrcamento.addEventListener("click", () => abrirFormularioProposta(null, aposSalvarOrcamento));
document.getElementById("btnImpostosMes").addEventListener("click", () => abrirModalImpostosMes());
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

// Se veio de uma Visita Técnica ("Gerar orçamento"), abre o formulário
// novo já preenchido com os dados da visita.
(function tentarAbrirComDadosDaVisita() {
  const params = new URLSearchParams(window.location.search);
  const dadosCodificados = params.get("dadosVisita");
  if (!dadosCodificados) return;
  try {
    const dados = JSON.parse(decodeURIComponent(escape(atob(dadosCodificados))));
    abrirFormularioProposta(null, aposSalvarOrcamento, dados);
  } catch (e) {
    console.warn("[orcamento] Não foi possível ler os dados da visita na URL:", e);
  }
})();
carregarObrasCache();

// ====================================================
// VISITAS AGUARDANDO ORÇAMENTO
// Toda visita técnica salva que ainda não virou orçamento aparece
// aqui (pra todo mundo). "Criar orçamento" abre o formulário já
// preenchido; ao salvar o orçamento, a visita sai da lista.
// "Não vai virar orçamento" tira da lista sem criar nada.
// ====================================================
function dadosPropostaDaVisita(v) {
  return montarOrcamentoDaVisita(v); // visita-para-orcamento.js
}

async function renderVisitasAguardando() {
  const bloco = document.getElementById("blocoVisitasAguardando");
  const lista = document.getElementById("listaVisitasAguardando");
  if (!bloco || !lista) return;
  const resp = await apiListarVisitas();
  if (!resp.ok) { bloco.style.display = "none"; return; }
  const aguardando = (resp.visitas || []).filter((v) => !v.convertidaEmPropostaId);
  if (!aguardando.length) { bloco.style.display = "none"; return; }
  bloco.style.display = "block";
  document.getElementById("contVisitasAguardando").textContent = aguardando.length;
  lista.innerHTML = "";
  aguardando.forEach((v) => {
    const quando = v.dataVisita ? v.dataVisita.split("-").reverse().join("/") : new Date(v.criadoEm).toLocaleDateString("pt-BR");
    const endereco = [v.endereco, v.bairro, v.cidade].filter(Boolean).join(", ");
    const el = document.createElement("div");
    el.className = "item-fila";
    el.innerHTML = `
      <div class="info-fila">
        <div class="nome-fila">${escaparHtml(v.clienteNome)}</div>
        <div class="meta-fila">Visita em ${quando}${endereco ? " · " + escaparHtml(endereco) : ""} · ${(v.fotos || []).length} foto(s)${v.criadoPorNome ? " · por " + escaparHtml(v.criadoPorNome) : ""}</div>
      </div>
      <div class="acoes-fila">
        <button type="button" class="btn-laranja btn-criar-da-visita">Criar orçamento</button>
        <button type="button" class="btn-dispensar-visita" title="Tirar da lista sem criar orçamento">Não vai virar orçamento</button>
      </div>`;
    el.querySelector(".btn-criar-da-visita").addEventListener("click", () => abrirFormularioProposta(null, aposSalvarOrcamento, dadosPropostaDaVisita(v)));
    el.querySelector(".btn-dispensar-visita").addEventListener("click", async () => {
      const ok = await confirmarAcao(`Tirar "${v.clienteNome}" da lista?`, "A visita continua salva em Visita Técnica — só não aparece mais aqui.");
      if (!ok) return;
      const r = await apiSalvarVisita({ ...v, convertidaEmPropostaId: "dispensada" });
      if (!r.ok) { mostrarToast(r.erro || "Não foi possível.", "erro"); return; }
      renderVisitasAguardando();
    });
    lista.appendChild(el);
  });
}

// ====================================================
// ORÇAMENTOS NÃO FINALIZADOS (rascunhos automáticos)
// Antes eles ficavam salvos no servidor, mas não havia onde reabrir.
// ====================================================
async function renderRascunhosOrcamento() {
  const bloco = document.getElementById("blocoRascunhosOrcamento");
  const lista = document.getElementById("listaRascunhosOrcamento");
  if (!bloco || !lista) return;
  const resp = await apiListarRascunhosProposta();
  const rascunhos = resp.ok ? (resp.rascunhos || []) : [];
  if (!rascunhos.length) { bloco.style.display = "none"; return; }
  bloco.style.display = "block";
  document.getElementById("contRascunhosOrcamento").textContent = rascunhos.length;
  lista.innerHTML = "";
  rascunhos.forEach((r) => {
    const d = r.dados || {};
    const quando = new Date(r.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const el = document.createElement("div");
    el.className = "item-fila";
    el.innerHTML = `
      <div class="info-fila">
        <div class="nome-fila">${escaparHtml(d.cliente) || "(sem cliente)"}${d.numeroOrcamento ? " · nº " + escaparHtml(d.numeroOrcamento) : ""}</div>
        <div class="meta-fila">Salvo sozinho em ${quando}${d.servico ? " · " + escaparHtml(d.servico) : ""}</div>
      </div>
      <div class="acoes-fila">
        <button type="button" class="btn-laranja btn-continuar-rasc">Continuar</button>
        <button type="button" class="btn-dispensar-visita btn-excluir-rasc">Excluir</button>
      </div>`;
    el.querySelector(".btn-continuar-rasc").addEventListener("click", () => {
      const dados = { ...d }; delete dados.id; // rascunho vira orçamento NOVO ao salvar
      abrirFormularioProposta(null, aposSalvarOrcamento, dados, r.id);
    });
    el.querySelector(".btn-excluir-rasc").addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir este orçamento não finalizado?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await apiExcluirRascunhoProposta(r.id);
      renderRascunhosOrcamento();
    });
    lista.appendChild(el);
  });
}

function aposSalvarOrcamento() {
  renderLista();
  renderVisitasAguardando();
  renderRascunhosOrcamento();
}

// O formulário avisa quando um rascunho é salvo/fechado → atualiza a lista
onListaPendentesAtualizarCallback = renderRascunhosOrcamento;
renderVisitasAguardando();
renderRascunhosOrcamento();

// Orçamentos chegaram da nuvem: redesenha a lista
document.addEventListener("propostas-carregadas", () => renderLista());
