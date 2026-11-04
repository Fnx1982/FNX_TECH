// ============================================================
// gerar-apresentacao.js — Proposta Comercial no padrão de empresa dev
//
// Formulário em 5 etapas → PDF com:
//   Capa · Sobre a FNX TECH · Entendimento do desafio · Escopo e
//   tecnologias · Cronograma (linha do tempo) · Investimento (das
//   estimativas cadastradas + suporte mensal) · Condições ·
//   Próximos passos e aceite.
//
// Os dados do formulário ficam salvos na nuvem (apresentacoes-salvar)
// e o PDF é remontado na hora de baixar de novo.
// ============================================================

const WORKER_URL_APRES = FNX_API;
let contadorBlocosProposta = 0;
let apresentacaoIdAtual = null;
let numeroReservado = null; // número sugerido pela numeração automática (só é "gasto" ao gerar)

const $a = (id) => document.getElementById(id);
const escA = (t) => (typeof escaparHtml === "function" ? escaparHtml(t) : String(t ?? ""));
const linhas = (txt) => String(txt || "").split("\n").map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
const moedaA = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── Textos padrão ─────────────────────────────────────────────
const PADRAO = {
  fornecemos: [
    "Levantamento e documentação dos requisitos junto ao cliente",
    "Protótipo navegável das telas principais para validação",
    "Desenvolvimento em sprints, com entregas parciais e ambiente de homologação",
    "Código versionado em repositório (Git) com acesso ao cliente",
    "Testes antes de cada publicação em produção",
    "Documentação técnica e treinamento da equipe na entrega",
  ].join("\n"),
  precisamos: [
    "Um ponto focal para validar entregas e tirar dúvidas",
    "Acessos a sistemas, servidores, domínios e contas necessários",
    "Conteúdos (textos, imagens e logos) nos formatos solicitados",
    "Retorno das validações em até 3 dias úteis",
  ].join("\n"),
  condicoes: [
    "Mudanças de escopo após a aprovação serão estimadas e aprovadas à parte",
    "Atrasos no envio de acessos, conteúdos ou aprovações estendem os prazos na mesma proporção",
    "Domínios, hospedagem, licenças e serviços de terceiros são de responsabilidade do cliente, salvo quando listados no investimento",
    "O código-fonte e a documentação são entregues ao cliente após a quitação",
    "Tratamento de dados pessoais de acordo com a LGPD",
    "A FNX TECH pode citar o projeto em seu portfólio, salvo informação confidencial",
  ].join("\n"),
  proximosPassos: [
    "Aprovação da proposta",
    "Assinatura do contrato e pagamento da entrada",
    "Reunião de kickoff e acesso aos ambientes",
    "Início da primeira sprint",
  ].join("\n"),
  fases: [
    { nome: "Descoberta e planejamento", semanas: 1, entregas: "Requisitos, backlog priorizado e cronograma" },
    { nome: "Design UX/UI", semanas: 2, entregas: "Protótipo navegável aprovado" },
    { nome: "Desenvolvimento", semanas: 4, entregas: "Funcionalidades em sprints com homologação" },
    { nome: "Testes e homologação", semanas: 1, entregas: "Correções e validação final" },
    { nome: "Publicação e treinamento", semanas: 1, entregas: "Sistema no ar e equipe treinada" },
  ],
};

$a("campoDataDoc").value = new Date().toISOString().slice(0, 10);
$a("campoFornecemos").value = PADRAO.fornecemos;
$a("campoPrecisamos").value = PADRAO.precisamos;
$a("campoCondicoes").value = PADRAO.condicoes;
$a("campoProximosPassos").value = PADRAO.proximosPassos;

// ── Clientes já usados em estimativas (sugestões) ─────────────
function popularClientesApresDatalist() {
  const nomes = [...new Set(lerPropostas().map((p) => p.cliente).filter(Boolean))];
  $a("listaClientesApresDatalist").innerHTML = nomes.map((n) => `<option value="${escA(n)}"></option>`).join("");
}
popularClientesApresDatalist();
document.addEventListener("propostas-carregadas", popularClientesApresDatalist);

// ── Tecnologias (prévia em chips) ─────────────────────────────
function stackLista() {
  return $a("campoStack").value.split(",").map((s) => s.trim()).filter(Boolean);
}
function renderPreviaStack() {
  $a("previaStack").innerHTML = stackLista().map((s) => `<span>${escA(s)}</span>`).join("");
}
$a("campoStack").addEventListener("input", renderPreviaStack);

// ============================================================
// CRONOGRAMA (fases)
// ============================================================
function adicionarFase(f = { nome: "", semanas: 1, entregas: "" }) {
  const linha = document.createElement("div");
  linha.className = "linha-fase";
  linha.innerHTML = `
    <input type="text" class="fase-nome" placeholder="Nome da fase" value="${escA(f.nome)}" aria-label="Nome da fase" />
    <label class="fase-semanas"><input type="number" min="0.5" step="0.5" value="${escA(f.semanas)}" aria-label="Semanas" /> sem.</label>
    <input type="text" class="fase-entregas" placeholder="O que é entregue nessa fase" value="${escA(f.entregas)}" aria-label="Entregas da fase" />
    <button type="button" class="btn-remover-fase" title="Remover fase" aria-label="Remover fase">&times;</button>`;
  linha.querySelector(".btn-remover-fase").addEventListener("click", () => { linha.remove(); atualizarTotalSemanas(); });
  linha.querySelector(".fase-semanas input").addEventListener("input", atualizarTotalSemanas);
  $a("tabelaFases").appendChild(linha);
  atualizarTotalSemanas();
}
function lerFases() {
  return [...document.querySelectorAll(".linha-fase")].map((l) => ({
    nome: l.querySelector(".fase-nome").value.trim(),
    semanas: Math.max(0, parseFloat(l.querySelector(".fase-semanas input").value) || 0),
    entregas: l.querySelector(".fase-entregas").value.trim(),
  })).filter((f) => f.nome);
}
function atualizarTotalSemanas() {
  const total = lerFases().reduce((s, f) => s + f.semanas, 0);
  $a("totalSemanas").textContent = total ? `Prazo total estimado: ${String(total).replace(".", ",")} semana(s).` : "";
}
$a("btnAddFase").addEventListener("click", () => adicionarFase());
PADRAO.fases.forEach(adicionarFase);

// ============================================================
// ESTIMATIVAS ANEXADAS (investimento)
// ============================================================
function valorFinalItemApres(item) {
  if (item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "") return parseFloat(item.valorFinal) || 0;
  return (parseFloat(item.qtd) || 0) * (parseFloat(item.valorUnit) || 0);
}
function renumerarBlocosProposta() {
  document.querySelectorAll(".bloco-proposta-anexada").forEach((b, i) => { b.querySelector(".bloco-proposta-numero").textContent = `Bloco ${i + 1}`; });
}
function atualizarPreviewProposta(bloco, proposta) {
  const preview = bloco.querySelector(".preview-itens-proposta");
  if (!proposta) { preview.classList.remove("visivel"); preview.innerHTML = ""; return; }
  const srv = totalMaoDeObra(proposta), prd = totalMateriais(proposta);
  const itens = [
    ...(proposta.itensMaoDeObra || []).map((i) => ({ tipo: "Serviço", nome: i.descricao, valor: valorFinalItemApres(i) })),
    ...(proposta.itensMateriais || []).map((i) => ({ tipo: "Produto", nome: i.nome, valor: valorFinalItemApres(i) })),
  ].filter((i) => (i.nome || "").trim());
  const mostrar = itens.slice(0, 5);
  preview.innerHTML = `
    <div class="pv-topo"><div>
      <div class="pv-numero">Estimativa ${proposta.numeroOrcamento ? "nº " + escA(proposta.numeroOrcamento) : ""}</div>
      <div class="pv-cliente">${escA(proposta.cliente || "(sem cliente)")}</div>
    </div><span class="pv-status">${escA(typeof rotuloStatus === "function" ? rotuloStatus(proposta) : "")}</span></div>
    <div class="pv-tiles">
      <div class="pv-tile"><span>Serviços</span><b>${moedaA(srv)}</b><small>${(proposta.itensMaoDeObra || []).length} item(ns)</small></div>
      <div class="pv-tile"><span>Produtos</span><b>${moedaA(prd)}</b><small>${(proposta.itensMateriais || []).length} item(ns)</small></div>
      <div class="pv-tile pv-total"><span>Total</span><b>${moedaA(srv + prd)}</b><small>vai assim no PDF</small></div>
    </div>
    ${mostrar.length ? `<ul class="pv-itens">${mostrar.map((i) => `<li><span class="pv-tipo ${i.tipo === "Serviço" ? "srv" : "mat"}">${i.tipo}</span><span class="pv-nome">${escA(i.nome)}</span><span class="pv-valor">${moedaA(i.valor)}</span></li>`).join("")}</ul>
    ${itens.length > mostrar.length ? `<div class="pv-mais">+ ${itens.length - mostrar.length} item(ns)</div>` : ""}` : ""}`;
  preview.classList.add("visivel");
}
function preencherSelectPropostasApres(select) {
  const atual = select.value;
  select.querySelectorAll("option:not([value=''])").forEach((o) => o.remove());
  lerPropostas().slice().sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.numeroOrcamento ? "Nº " + p.numeroOrcamento + " — " : ""}${p.cliente || "(sem cliente)"} — ${p.servico || "(sem descrição)"}`;
    select.appendChild(opt);
  });
  select.value = atual;
}
document.addEventListener("propostas-carregadas", () => {
  document.querySelectorAll(".campo-select-proposta-existente").forEach(preencherSelectPropostasApres);
  document.querySelectorAll(".bloco-proposta-anexada").forEach((b) => {
    const id = b.querySelector(".campo-select-proposta-existente").value;
    if (id) atualizarPreviewProposta(b, buscarProposta(id));
  });
});
function criarBlocoProposta() {
  const clone = $a("templateBlocoProposta").content.cloneNode(true);
  const bloco = clone.querySelector(".bloco-proposta-anexada");
  bloco.dataset.blocoId = ++contadorBlocosProposta;
  const sel = bloco.querySelector(".campo-select-proposta-existente");
  preencherSelectPropostasApres(sel);
  sel.addEventListener("change", () => {
    const p = buscarProposta(sel.value);
    if (p) {
      const nome = bloco.querySelector(".campo-nome-servico-anexado");
      const pag = bloco.querySelector(".campo-forma-pagamento-anexada");
      const prazo = bloco.querySelector(".campo-programacao-anexada");
      if (!nome.value.trim()) nome.value = p.servico || "";
      if (!pag.value.trim()) { const t = linhasCondicaoPagamento(p, true).join(" "); if (t) pag.value = t; }
      if (p.planejamentoDias && !prazo.value.trim()) prazo.value = `${p.planejamentoDias} dias úteis`;
      if (!$a("campoNomeClienteApres").value.trim() && p.cliente) $a("campoNomeClienteApres").value = p.cliente;
      if (!$a("campoNomeProjeto").value.trim() && p.servico) $a("campoNomeProjeto").value = p.servico;
    }
    atualizarPreviewProposta(bloco, p);
  });
  bloco.querySelector(".btn-remover-bloco-proposta").addEventListener("click", async () => {
    if (!(await confirmarAcao("Remover este bloco da proposta?", ""))) return;
    bloco.remove();
    renumerarBlocosProposta();
  });
  $a("listaPropostasAnexadas").appendChild(bloco);
  renumerarBlocosProposta();
  return bloco;
}
$a("btnAdicionarPropostaApres").addEventListener("click", criarBlocoProposta);
criarBlocoProposta();

// ============================================================
// ETAPAS
// ============================================================
let etapaAtual = 1;
const TOTAL_ETAPAS = 5;
function irParaEtapa(n) {
  etapaAtual = Math.min(Math.max(1, n), TOTAL_ETAPAS);
  document.querySelectorAll("[data-etapa-conteudo]").forEach((el) => { el.hidden = Number(el.dataset.etapaConteudo) !== etapaAtual; });
  document.querySelectorAll(".etapa-pill").forEach((p) => {
    const e = Number(p.dataset.etapa);
    p.classList.toggle("active", e === etapaAtual);
    p.classList.toggle("concluida", e < etapaAtual);
  });
  $a("btnEtapaVoltar").style.visibility = etapaAtual === 1 ? "hidden" : "visible";
  $a("btnEtapaAvancar").style.display = etapaAtual === TOTAL_ETAPAS ? "none" : "";
  if (etapaAtual === TOTAL_ETAPAS) renderResumoRevisao();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function validarEtapaAtual() {
  if (etapaAtual === 1) {
    let ok = true;
    if (!$a("campoNomeClienteApres").value.trim()) { marcarCampoComErro($a("campoNomeClienteApres"), "Informe o cliente."); ok = false; }
    if (!$a("campoNomeProjeto").value.trim()) { marcarCampoComErro($a("campoNomeProjeto"), "Dê um nome ao projeto."); ok = false; }
    return ok;
  }
  return true;
}
["campoNomeClienteApres", "campoNomeProjeto"].forEach((id) => limparErroAoEditar($a(id)));
$a("btnEtapaAvancar").addEventListener("click", () => { if (validarEtapaAtual()) irParaEtapa(etapaAtual + 1); });
$a("btnEtapaVoltar").addEventListener("click", () => irParaEtapa(etapaAtual - 1));
document.querySelectorAll(".etapa-pill").forEach((p) => p.addEventListener("click", () => {
  const destino = Number(p.dataset.etapa);
  if (destino > 1 && etapaAtual === 1 && !validarEtapaAtual()) return;
  irParaEtapa(destino);
}));

function coletarDadosApresentacao() {
  return {
    nomeCliente: $a("campoNomeClienteApres").value.trim(),
    contatoCliente: $a("campoContatoCliente").value.trim(),
    nomeProjeto: $a("campoNomeProjeto").value.trim(),
    tipoProjeto: $a("campoTipoProjeto").value,
    numeroDocumento: $a("campoNumeroDoc").value.trim(),
    data: $a("campoDataDoc").value,
    desafio: $a("campoDesafio").value.trim(),
    objetivos: $a("campoObjetivos").value.trim(),
    entregaveis: $a("campoEntregaveis").value.trim(),
    foraEscopo: $a("campoForaEscopo").value.trim(),
    stack: $a("campoStack").value.trim(),
    fases: lerFases(),
    suporteValor: $a("campoSuporteValor").value,
    suporteDescricao: $a("campoSuporteDescricao").value.trim(),
    garantiaNumero: $a("campoGarantiaNumero").value,
    garantiaUnidade: $a("campoGarantiaUnidade").value,
    validadeDias: $a("campoValidadeDias").value,
    anosExperiencia: $a("campoAnosExperiencia").value,
    fornecemos: $a("campoFornecemos").value.trim(),
    precisamos: $a("campoPrecisamos").value.trim(),
    condicoes: $a("campoCondicoes").value.trim(),
    proximosPassos: $a("campoProximosPassos").value.trim(),
    propostasAnexadas: [...document.querySelectorAll(".bloco-proposta-anexada")].map((b) => {
      const id = b.querySelector(".campo-select-proposta-existente").value;
      return {
        propostaId: id || null,
        proposta: id ? buscarProposta(id) : null,
        nomeServico: b.querySelector(".campo-nome-servico-anexado").value.trim(),
        formaPagamento: b.querySelector(".campo-forma-pagamento-anexada").value.trim(),
        programacao: b.querySelector(".campo-programacao-anexada").value.trim(),
      };
    }).filter((p) => p.propostaId || p.nomeServico),
  };
}
function totalInvestimento(dados) {
  return dados.propostasAnexadas.reduce((s, p) => s + (p.proposta ? totalMaoDeObra(p.proposta) + totalMateriais(p.proposta) : 0), 0);
}
function renderResumoRevisao() {
  const d = coletarDadosApresentacao();
  const semanas = d.fases.reduce((s, f) => s + f.semanas, 0);
  const linha = (r, v) => `<div class="linha-resumo"><span>${r}</span><strong>${v}</strong></div>`;
  $a("resumoRevisaoApres").innerHTML =
    linha("Cliente", escA(d.nomeCliente) || "—") +
    linha("Projeto", escA(d.nomeProjeto) || "—") +
    linha("Nº / data", `${escA(d.numeroDocumento) || "—"} · ${d.data ? new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}`) +
    linha("Entregáveis", String(linhas(d.entregaveis).length)) +
    linha("Fases", `${d.fases.length} (${String(semanas).replace(".", ",")} semanas)`) +
    linha("Investimento", moedaA(totalInvestimento(d)) + (Number(d.suporteValor) > 0 ? ` + ${moedaA(d.suporteValor)}/mês` : ""));
  const campo = $a("campoNomeArquivoApres");
  if (!campo.value.trim() && d.nomeCliente) {
    campo.value = `Proposta_${d.nomeCliente.replace(/[^\p{L}\p{N}]+/gu, "_")}_${d.numeroDocumento || new Date().toISOString().slice(0, 10)}`;
  }
}

$a("btnGerarPdfApresentacao").addEventListener("click", () => {
  const d = coletarDadosApresentacao();
  if (!d.nomeCliente || !d.nomeProjeto) { irParaEtapa(1); validarEtapaAtual(); return; }
  gerarPdfApresentacao(d);
});

// ============================================================
// PDF
// ============================================================
const COR = {
  laranja: [255, 106, 0], vermelho: [229, 20, 27], preto: [14, 14, 14], grafite: [28, 28, 28],
  texto: [40, 40, 40], cinza: [110, 110, 115], linha: [228, 228, 232], fundo: [246, 246, 248], branco: [255, 255, 255], ambar: [255, 176, 0],
};
function misturar(c1, c2, t) { return c1.map((v, i) => Math.round(v + (c2[i] - v) * t)); }

async function gerarPdfApresentacao(dados) {
  const botao = $a("btnGerarPdfApresentacao");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Gerando...";
  try {
    await propostasProntas;
    dados.propostasAnexadas.forEach((p) => { if (p.propostaId && !p.proposta) p.proposta = buscarProposta(p.propostaId); });

    // Numeração automática: só "gasta" o número quando o PDF é gerado
    if (!apresentacaoIdAtual && numeroReservado && dados.numeroDocumento === String(numeroReservado)) {
      try { dados.numeroDocumento = String(await proximoNumeroSequencial("apresentacao")); $a("campoNumeroDoc").value = dados.numeroDocumento; } catch (e) { /* segue */ }
      numeroReservado = null;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const M = 48, LU = PW - M * 2;
    const EMP = typeof FNX_EMPRESA !== "undefined" ? FNX_EMPRESA : { nome: "FNX TECH" };
    const dataFmt = dados.data ? new Date(dados.data + "T12:00:00").toLocaleDateString("pt-BR") : "";
    let y = 0;
    let secao = 0;

    const cor = (c) => doc.setTextColor(...c);
    const fill = (c) => doc.setFillColor(...c);
    const fonte = (estilo, tam) => { doc.setFont("helvetica", estilo); doc.setFontSize(tam); };
    const opac = (o) => { try { doc.setGState(new doc.GState({ opacity: o })); } catch (e) { /* sem suporte */ } };
    function gradiente(x, yy, w, h, c1, c2, vertical) {
      const n = 48;
      for (let i = 0; i < n; i++) {
        fill(misturar(c1, c2, i / (n - 1)));
        if (vertical) doc.rect(x, yy + (h / n) * i, w, h / n + 0.6, "F");
        else doc.rect(x + (w / n) * i, yy, w / n + 0.6, h, "F");
      }
    }
    function cabecalho() {
      gradiente(0, 0, PW, 4, COR.laranja, COR.vermelho);
      fonte("bold", 9); cor(COR.preto);
      doc.text(EMP.nome || "FNX TECH", M, 30);
      fonte("normal", 8.5); cor(COR.cinza);
      doc.text(`Proposta ${dados.numeroDocumento ? "nº " + dados.numeroDocumento + " · " : ""}${dados.nomeProjeto}`, PW - M, 30, { align: "right", maxWidth: LU - 120 });
      doc.setDrawColor(...COR.linha); doc.setLineWidth(0.6); doc.line(M, 40, PW - M, 40);
      y = 72;
    }
    function novaPagina() { doc.addPage(); cabecalho(); }
    function garantir(h) { if (y + h > PH - 64) novaPagina(); }
    function tituloSecao(titulo, subtitulo) {
      garantir(90);
      secao += 1;
      fonte("bold", 30); cor(COR.laranja);
      doc.text(String(secao).padStart(2, "0"), M, y + 22);
      fonte("bold", 20); cor(COR.preto);
      doc.text(titulo, M + 52, y + 14);
      if (subtitulo) { fonte("normal", 10); cor(COR.cinza); doc.text(subtitulo, M + 52, y + 30); }
      gradiente(M + 52, y + 38, 60, 3, COR.laranja, COR.vermelho);
      y += 64;
    }
    function paragrafo(txt, { tam = 10.5, estilo = "normal", c = COR.texto, x = M, w = LU, apos = 10 } = {}) {
      if (!txt) return;
      fonte(estilo, tam); cor(c);
      const ls = doc.splitTextToSize(txt, w);
      const alt = tam * 1.45;
      ls.forEach((l) => { garantir(alt); doc.text(l, x, y + tam); y += alt; });
      y += apos;
    }
    function subtitulo(txt) { garantir(40); fonte("bold", 12); cor(COR.preto); doc.text(txt, M, y + 12); y += 24; }
    function listaMarcada(itens, tipo = "ponto") {
      itens.forEach((t, i) => {
        fonte("normal", 10.5);
        const ls = doc.splitTextToSize(t, LU - 26);
        garantir(ls.length * 15 + 6);
        if (tipo === "check") {
          fill(COR.laranja); doc.roundedRect(M, y + 2, 12, 12, 3, 3, "F");
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.6);
          doc.line(M + 3, y + 8.5, M + 5.4, y + 11); doc.line(M + 5.4, y + 11, M + 9.5, y + 5);
        } else if (tipo === "x") {
          doc.setDrawColor(...COR.cinza); doc.setLineWidth(1.2);
          doc.line(M + 2, y + 4, M + 9, y + 11); doc.line(M + 9, y + 4, M + 2, y + 11);
        } else if (tipo === "numero") {
          fill(COR.preto); doc.circle(M + 7, y + 8, 8, "F");
          fonte("bold", 8.5); cor(COR.branco); doc.text(String(i + 1), M + 7, y + 11, { align: "center" });
        } else {
          fill(COR.laranja); doc.rect(M + 2, y + 5, 6, 6, "F");
        }
        fonte("normal", 10.5); cor(COR.texto);
        ls.forEach((l, k) => doc.text(l, M + 24, y + 12 + k * 15));
        y += ls.length * 15 + 7;
      });
      y += 6;
    }
    function chips(lista, x0 = M) {
      let x = x0;
      fonte("bold", 9.5);
      lista.forEach((t) => {
        const w = doc.getTextWidth(t) + 20;
        if (x + w > PW - M) { x = x0; y += 28; }
        garantir(28);
        fill(COR.fundo); doc.setDrawColor(...COR.linha); doc.setLineWidth(0.8);
        doc.roundedRect(x, y, w, 22, 11, 11, "FD");
        fill(COR.laranja); doc.circle(x + 9, y + 11, 2.4, "F");
        cor(COR.preto); doc.text(t, x + 14, y + 14.5);
        x += w + 8;
      });
      y += 34;
    }

    // ── CAPA ────────────────────────────────────────────────
    fill(COR.preto); doc.rect(0, 0, PW, PH, "F");
    opac(0.22); fill(COR.laranja); doc.circle(PW * 0.05, PH * 0.05, 190, "F");
    opac(0.18); fill(COR.vermelho); doc.circle(PW * 1.0, PH * 0.95, 230, "F");
    opac(1);
    // grade sutil de "código"
    doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.4);
    for (let gx = 0; gx < PW; gx += 32) doc.line(gx, PH * 0.55, gx, PH);
    gradiente(0, PH - 10, PW, 10, COR.laranja, COR.vermelho);

    if (typeof LOGO_EMPRESA_BASE64 !== "undefined" && LOGO_EMPRESA_BASE64) {
      try { doc.addImage(LOGO_EMPRESA_BASE64, "JPEG", M, 60, 150, 150 / (LOGO_EMPRESA_PROPORCAO || 3.35)); } catch (e) { /* sem logo */ }
    } else {
      fonte("bold", 26); cor(COR.branco); doc.text(EMP.nome || "FNX TECH", M, 92);
      gradiente(M, 102, 46, 4, COR.laranja, COR.vermelho);
    }
    fonte("bold", 10); cor(COR.laranja);
    doc.text("PROPOSTA COMERCIAL", M, 300, { charSpace: 2.5 });
    fonte("bold", 34); cor(COR.branco);
    const tituloCapa = doc.splitTextToSize(dados.nomeProjeto, LU);
    tituloCapa.slice(0, 3).forEach((l, i) => doc.text(l, M, 345 + i * 40));
    let yc = 345 + Math.min(tituloCapa.length, 3) * 40;
    fonte("normal", 14); cor([200, 200, 205]);
    doc.text(`Preparada para ${dados.nomeCliente}`, M, yc + 6);
    fonte("bold", 9.5);
    const chipTipo = dados.tipoProjeto.toUpperCase();
    const wChip = doc.getTextWidth(chipTipo) + 24;
    doc.setDrawColor(...COR.laranja); doc.setLineWidth(1);
    doc.roundedRect(M, yc + 24, wChip, 22, 11, 11, "S");
    cor(COR.laranja); doc.text(chipTipo, M + 12, yc + 38.5);

    const meta = [
      ["PROPOSTA", dados.numeroDocumento ? "Nº " + dados.numeroDocumento : "—"],
      ["DATA", dataFmt || "—"],
      ["VALIDADE", `${dados.validadeDias || 15} dias`],
      ["CONTATO", dados.contatoCliente || dados.nomeCliente],
    ];
    const colW = LU / 4;
    meta.forEach(([r, v], i) => {
      const x = M + colW * i;
      fonte("bold", 7.5); cor([150, 150, 155]); doc.text(r, x, PH - 110, { charSpace: 1.2 });
      fonte("bold", 10.5); cor(COR.branco); doc.text(doc.splitTextToSize(v, colW - 12).slice(0, 2), x, PH - 92);
    });

    // ── 01 SOBRE ────────────────────────────────────────────
    novaPagina();
    tituloSecao(`Sobre a ${EMP.nome || "FNX TECH"}`, "Tecnologia sob medida para o seu negócio");
    const anos = parseInt(dados.anosExperiencia, 10) || 0;
    paragrafo(`${anos ? `Há ${anos} ano${anos > 1 ? "s" : ""}, a` : "A"} ${EMP.nome || "FNX TECH"} desenvolve software que resolve problemas reais: sistemas web, aplicativos, integrações e automações pensados para o dia a dia de cada cliente.`);
    paragrafo("Trabalhamos em ciclos curtos, com entregas frequentes e o cliente acompanhando cada etapa — do levantamento de requisitos até a publicação e o suporte.", { apos: 22 });
    const servicos = [
      ["Sistemas web", "Plataformas, painéis e portais sob medida"],
      ["Apps mobile", "Aplicativos Android e iOS"],
      ["Sites e landing pages", "Rápidos, responsivos e otimizados"],
      ["Integrações e APIs", "Conectamos seus sistemas e dados"],
      ["Automação e IA", "Menos trabalho manual, mais resultado"],
      ["Cloud e DevOps", "Infraestrutura, deploy e monitoramento"],
    ];
    garantir(200);
    const cw = (LU - 20) / 3, ch = 82;
    servicos.forEach(([t, s], i) => {
      const x = M + (i % 3) * (cw + 10), yy = y + Math.floor(i / 3) * (ch + 10);
      fill(COR.fundo); doc.roundedRect(x, yy, cw, ch, 8, 8, "F");
      gradiente(x, yy, 4, ch, COR.laranja, COR.vermelho, true);
      fonte("bold", 11); cor(COR.preto); doc.text(t, x + 16, yy + 26);
      fonte("normal", 9); cor(COR.cinza); doc.text(doc.splitTextToSize(s, cw - 28), x + 16, yy + 44);
    });
    y += ch * 2 + 34;
    garantir(90);
    fill(COR.preto); doc.roundedRect(M, y, LU, 72, 10, 10, "F");
    const destaques = [[anos ? `${anos}+` : "100%", anos ? "anos de experiência" : "sob medida"], ["Ágil", "entregas em sprints"], ["Suporte", "contínuo após a entrega"]];
    destaques.forEach(([n, r], i) => {
      const x = M + (LU / 3) * i + 22;
      fonte("bold", 20); cor(COR.laranja); doc.text(n, x, y + 34);
      fonte("normal", 9); cor([200, 200, 205]); doc.text(r, x, y + 52);
    });
    y += 96;

    // ── 02 DESAFIO ──────────────────────────────────────────
    if (dados.desafio || linhas(dados.objetivos).length) {
      novaPagina();
      tituloSecao("Entendimento do desafio", `O que ouvimos de ${dados.nomeCliente}`);
      if (dados.desafio) {
        fonte("normal", 11);
        const ls = doc.splitTextToSize(dados.desafio, LU - 40);
        const h = ls.length * 16 + 32;
        garantir(h);
        fill(COR.fundo); doc.roundedRect(M, y, LU, h, 8, 8, "F");
        gradiente(M, y, 4, h, COR.laranja, COR.vermelho, true);
        cor(COR.texto); ls.forEach((l, i) => doc.text(l, M + 22, y + 24 + i * 16));
        y += h + 26;
      }
      if (linhas(dados.objetivos).length) { subtitulo("Objetivos"); listaMarcada(linhas(dados.objetivos), "numero"); }
    }

    // ── 03 ESCOPO ───────────────────────────────────────────
    if (linhas(dados.entregaveis).length || linhas(dados.foraEscopo).length || stackLista().length) {
      novaPagina();
      tituloSecao("Escopo do projeto", "O que está incluído nesta proposta");
      if (linhas(dados.entregaveis).length) { subtitulo("Entregáveis"); listaMarcada(linhas(dados.entregaveis), "check"); }
      if (linhas(dados.foraEscopo).length) { subtitulo("Fora do escopo"); listaMarcada(linhas(dados.foraEscopo), "x"); }
      const st = String(dados.stack || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (st.length) { subtitulo("Tecnologias"); chips(st); }
    }

    // ── 04 CRONOGRAMA ───────────────────────────────────────
    const fases = dados.fases.filter((f) => f.semanas > 0);
    if (fases.length) {
      novaPagina();
      const total = fases.reduce((s, f) => s + f.semanas, 0);
      tituloSecao("Cronograma", `Prazo total estimado: ${String(total).replace(".", ",")} semana${total > 1 ? "s" : ""}`);
      const colNome = 170, xBar = M + colNome, wBar = LU - colNome;
      const escala = wBar / total;
      // régua de semanas
      fonte("normal", 7.5); cor(COR.cinza);
      const passo = total > 16 ? 4 : total > 8 ? 2 : 1;
      for (let s = 0; s <= total; s += passo) {
        const x = xBar + s * escala;
        doc.setDrawColor(...COR.linha); doc.setLineWidth(0.5); doc.line(x, y + 12, x, y + 22 + fases.length * 46);
        doc.text(`S${s}`, x, y + 8, { align: "center" });
      }
      y += 20;
      let inicio = 0;
      fases.forEach((f, i) => {
        garantir(46);
        fonte("bold", 10); cor(COR.preto);
        doc.text(doc.splitTextToSize(f.nome, colNome - 12)[0], M, y + 14);
        fonte("normal", 8); cor(COR.cinza);
        if (f.entregas) doc.text(doc.splitTextToSize(f.entregas, colNome - 12).slice(0, 2), M, y + 26);
        const x = xBar + inicio * escala, w = Math.max(f.semanas * escala, 8);
        const c1 = misturar(COR.laranja, COR.vermelho, i / Math.max(1, fases.length - 1));
        fill(c1); doc.roundedRect(x, y + 4, w, 18, 5, 5, "F");
        fonte("bold", 8); cor(COR.branco);
        const rot = `${String(f.semanas).replace(".", ",")} sem`;
        if (doc.getTextWidth(rot) + 10 < w) doc.text(rot, x + 6, y + 16);
        else { cor(COR.cinza); doc.text(rot, x + w + 4, y + 16); }
        inicio += f.semanas;
        y += 46;
      });
      y += 10;
      paragrafo("As datas são confirmadas na reunião de kickoff e podem mudar conforme o envio de acessos, conteúdos e validações pelo cliente.", { tam: 9, c: COR.cinza });
    }

    // ── 05 INVESTIMENTO ─────────────────────────────────────
    novaPagina();
    tituloSecao("Investimento", "Valores e forma de pagamento");
    let totalGeralProp = 0;
    dados.propostasAnexadas.forEach((pa, idx) => {
      const p = pa.proposta;
      garantir(80);
      fonte("bold", 13); cor(COR.preto);
      doc.text(pa.nomeServico || (p && p.servico) || `Bloco ${idx + 1}`, M, y + 12);
      y += 22;
      if (p) {
        const corpo = [];
        (p.itensMaoDeObra || []).filter((i) => (i.descricao || "").trim()).forEach((i) =>
          corpo.push(["Serviço", i.descricao + (i.obsCliente ? `\n${i.obsCliente}` : ""), `${i.qtd || 1} ${i.unid || ""}`.trim(), moedaA(valorFinalItemApres(i))]));
        (p.itensMateriais || []).filter((i) => (i.nome || "").trim()).forEach((i) =>
          corpo.push(["Produto", i.nome + (i.obsCliente ? `\n${i.obsCliente}` : ""), `${i.qtd || 1} ${i.unid || ""}`.trim(), moedaA(valorFinalItemApres(i))]));
        const descontos = (typeof descontoMaoDeObra === "function" ? descontoMaoDeObra(p) : 0) + (typeof descontoMateriais === "function" ? descontoMateriais(p) : 0);
        const ajustes = (parseFloat(p.ajusteMaoDeObra) || 0) + (parseFloat(p.ajusteMateriais) || 0);
        const total = totalMaoDeObra(p) + totalMateriais(p);
        totalGeralProp += total;
        const rodapeT = [];
        if (descontos > 0) rodapeT.push(["", "Desconto", "", "- " + moedaA(descontos)]);
        if (ajustes) rodapeT.push(["", "Ajuste", "", moedaA(ajustes)]);
        rodapeT.push(["", "Total", "", moedaA(total)]);
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: 60, bottom: 64 },
          head: [["Tipo", "Descrição", "Qtd", "Valor"]], body: corpo, foot: rodapeT,
          theme: "plain",
          styles: { font: "helvetica", fontSize: 9.5, cellPadding: 7, textColor: COR.texto, fillColor: COR.branco, lineColor: COR.linha, lineWidth: { bottom: 0.6 } },
          bodyStyles: { fillColor: COR.branco },
          alternateRowStyles: { fillColor: [251, 251, 252] },
          headStyles: { fillColor: COR.preto, textColor: COR.branco, fontStyle: "bold", fontSize: 8.5 },
          footStyles: { fillColor: COR.fundo, textColor: COR.preto, fontStyle: "bold" },
          columnStyles: { 0: { cellWidth: 62, textColor: COR.laranja, fontStyle: "bold", fontSize: 8.5 }, 2: { cellWidth: 60, halign: "center" }, 3: { cellWidth: 92, halign: "right" } },
          willDrawPage: (d) => { if (d.pageNumber > 1) cabecalho(); },
        });
        y = doc.lastAutoTable.finalY + 12;
      }
      const info = [];
      if (pa.formaPagamento) info.push(["Pagamento", pa.formaPagamento]);
      if (pa.programacao) info.push(["Prazo", pa.programacao]);
      info.forEach(([r, v]) => {
        fonte("normal", 9.5);
        const ls = doc.splitTextToSize(v, LU - 80);
        garantir(ls.length * 13 + 6);
        fonte("bold", 9.5); cor(COR.preto); doc.text(r, M, y + 10);
        fonte("normal", 9.5); cor(COR.texto); doc.text(ls, M + 80, y + 10);
        y += ls.length * 13 + 6;
      });
      y += 18;
    });
    if (totalGeralProp > 0) {
      garantir(80);
      fill(COR.preto); doc.roundedRect(M, y, LU, 62, 10, 10, "F");
      gradiente(M, y + 58, LU, 4, COR.laranja, COR.vermelho);
      fonte("bold", 9); cor([170, 170, 175]); doc.text("INVESTIMENTO TOTAL DO PROJETO", M + 22, y + 26, { charSpace: 1 });
      fonte("bold", 22); cor(COR.branco); doc.text(moedaA(totalGeralProp), PW - M - 22, y + 38, { align: "right" });
      y += 82;
    }
    if (Number(dados.suporteValor) > 0) {
      garantir(70);
      doc.setDrawColor(...COR.laranja); doc.setLineWidth(1.2);
      doc.roundedRect(M, y, LU, 58, 10, 10, "S");
      fonte("bold", 11); cor(COR.preto); doc.text("Suporte e manutenção mensal", M + 20, y + 24);
      fonte("normal", 9); cor(COR.cinza);
      if (dados.suporteDescricao) doc.text(doc.splitTextToSize(dados.suporteDescricao, LU - 200)[0], M + 20, y + 40);
      fonte("bold", 16); cor(COR.laranja); doc.text(`${moedaA(dados.suporteValor)}/mês`, PW - M - 20, y + 36, { align: "right" });
      y += 76;
    }

    // ── 06 CONDIÇÕES ────────────────────────────────────────
    novaPagina();
    tituloSecao("Condições", "Como vamos trabalhar juntos");
    garantir(60);
    const garantiaTxt = `${dados.garantiaNumero || 0} ${dados.garantiaUnidade || "dias"}`;
    [[`Garantia: ${garantiaTxt}`, "contra falhas no que foi entregue"], [`Validade: ${dados.validadeDias || 15} dias`, "a partir da data desta proposta"]].forEach(([t, s], i) => {
      const x = M + i * (LU / 2 + 5), w = LU / 2 - 5;
      fill(COR.fundo); doc.roundedRect(x, y, w, 50, 8, 8, "F");
      fonte("bold", 12); cor(COR.preto); doc.text(t, x + 16, y + 22);
      fonte("normal", 9); cor(COR.cinza); doc.text(s, x + 16, y + 37);
    });
    y += 72;
    if (linhas(dados.fornecemos).length) { subtitulo(`O que a ${EMP.nome || "FNX TECH"} entrega`); listaMarcada(linhas(dados.fornecemos), "check"); }
    if (linhas(dados.precisamos).length) { subtitulo("O que precisamos do cliente"); listaMarcada(linhas(dados.precisamos)); }
    if (linhas(dados.condicoes).length) { subtitulo("Condições gerais"); listaMarcada(linhas(dados.condicoes)); }

    // ── 07 PRÓXIMOS PASSOS E ACEITE ─────────────────────────
    novaPagina();
    tituloSecao("Próximos passos", "Do sim ao primeiro commit");
    const passos = linhas(dados.proximosPassos);
    if (passos.length) {
      garantir(120);
      const n = passos.length, larg = LU / n;
      doc.setDrawColor(...COR.linha); doc.setLineWidth(2);
      doc.line(M + larg / 2, y + 18, M + larg * (n - 0.5), y + 18);
      passos.forEach((p, i) => {
        const cx = M + larg * i + larg / 2;
        fill(misturar(COR.laranja, COR.vermelho, i / Math.max(1, n - 1))); doc.circle(cx, y + 18, 16, "F");
        fonte("bold", 12); cor(COR.branco); doc.text(String(i + 1), cx, y + 22.5, { align: "center" });
        fonte("bold", 9.5); cor(COR.preto);
        doc.text(doc.splitTextToSize(p, larg - 14).slice(0, 4), cx, y + 52, { align: "center" });
      });
      y += 130;
    }
    garantir(170);
    fonte("bold", 13); cor(COR.preto); doc.text("Aceite da proposta", M, y + 12);
    y += 24;
    paragrafo(`Ao assinar, ${dados.nomeCliente} aprova o escopo, o cronograma e o investimento descritos nesta proposta${dados.numeroDocumento ? ` (nº ${dados.numeroDocumento})` : ""}.`, { tam: 9.5, c: COR.cinza, apos: 50 });
    const wAss = LU / 2 - 20;
    [[dados.nomeCliente, dados.contatoCliente || "Cliente"], [EMP.razaoSocial || EMP.nome || "FNX TECH", "Contratada"]].forEach(([nome, papel], i) => {
      const x = M + i * (wAss + 40);
      doc.setDrawColor(...COR.texto); doc.setLineWidth(0.8); doc.line(x, y, x + wAss, y);
      fonte("bold", 10); cor(COR.preto); doc.text(doc.splitTextToSize(nome, wAss)[0], x, y + 16);
      fonte("normal", 8.5); cor(COR.cinza); doc.text(papel, x, y + 29);
    });
    y += 50;
    fonte("normal", 9); cor(COR.cinza); doc.text("Data: ____/____/________", M, y + 10);

    // ── Rodapé em todas as páginas (menos a capa) ───────────
    const totalPag = doc.internal.getNumberOfPages();
    const contato = [EMP.site, EMP.email, EMP.fone].filter(Boolean).join("  ·  ");
    for (let i = 2; i <= totalPag; i++) {
      doc.setPage(i);
      doc.setDrawColor(...COR.linha); doc.setLineWidth(0.6); doc.line(M, PH - 42, PW - M, PH - 42);
      fonte("normal", 8); cor(COR.cinza);
      doc.text(contato || (EMP.nome || "FNX TECH"), M, PH - 26);
      doc.text(`${i} / ${totalPag}`, PW - M, PH - 26, { align: "right" });
    }

    const sugerido = `Proposta_${dados.nomeCliente.replace(/[^\p{L}\p{N}]+/gu, "_")}_${dados.numeroDocumento || new Date().toISOString().slice(0, 10)}`;
    const nomeFinal = ($a("campoNomeArquivoApres").value.trim() || sugerido).replace(/\.pdf$/i, "") + ".pdf";
    doc.save(nomeFinal);

    // Salva o formulário na nuvem (o PDF é remontado ao baixar de novo)
    const { propostasAnexadas, ...resto } = dados;
    const r = await apiSalvarApresentacao({
      id: apresentacaoIdAtual || undefined,
      ...resto,
      nomeArquivo: nomeFinal,
      propostasAnexadas: propostasAnexadas.map((p) => ({ propostaId: p.propostaId, nomeServico: p.nomeServico, formaPagamento: p.formaPagamento, programacao: p.programacao })),
    });
    if (r.ok) { apresentacaoIdAtual = r.id; mostrarToast("PDF gerado e proposta salva na nuvem."); }
    else mostrarToast("PDF gerado, mas não foi possível salvar na nuvem: " + (r.erro || ""), "erro");
  } catch (e) {
    console.error("[gerar-apresentacao] Erro ao gerar PDF:", e);
    mostrarToast("Erro ao gerar o PDF: " + e.message, "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

// ============================================================
// REABRIR UMA PROPOSTA SALVA (?id=... e ?baixar=1)
// ============================================================
async function carregarApresentacaoPorId(id) {
  const resposta = await apiListarApresentacoes();
  if (!resposta.ok) { mostrarToast("Não foi possível carregar a proposta.", "erro"); return null; }
  const a = (resposta.apresentacoes || []).find((x) => x.id === id);
  if (!a) { mostrarToast("Proposta não encontrada.", "erro"); return null; }
  apresentacaoIdAtual = a.id;
  const set = (campo, v, padrao = "") => { $a(campo).value = v !== undefined && v !== null && v !== "" ? v : padrao; };
  set("campoNomeClienteApres", a.nomeCliente);
  set("campoContatoCliente", a.contatoCliente);
  set("campoNomeProjeto", a.nomeProjeto);
  set("campoTipoProjeto", a.tipoProjeto, "Sistema web");
  set("campoNumeroDoc", a.numeroDocumento);
  set("campoDataDoc", a.data);
  set("campoDesafio", a.desafio);
  set("campoObjetivos", a.objetivos);
  set("campoEntregaveis", a.entregaveis);
  set("campoForaEscopo", a.foraEscopo);
  set("campoStack", a.stack);
  set("campoSuporteValor", a.suporteValor);
  set("campoSuporteDescricao", a.suporteDescricao);
  set("campoGarantiaNumero", a.garantiaNumero, 90);
  set("campoGarantiaUnidade", a.garantiaUnidade, "dias");
  set("campoValidadeDias", a.validadeDias, 15);
  set("campoAnosExperiencia", a.anosExperiencia, 5);
  set("campoFornecemos", a.fornecemos, PADRAO.fornecemos);
  set("campoPrecisamos", a.precisamos, PADRAO.precisamos);
  set("campoCondicoes", a.condicoes, PADRAO.condicoes);
  set("campoProximosPassos", a.proximosPassos, PADRAO.proximosPassos);
  set("campoNomeArquivoApres", (a.nomeArquivo || "").replace(/\.pdf$/i, ""));
  renderPreviaStack();
  if (Array.isArray(a.fases)) { $a("tabelaFases").innerHTML = ""; a.fases.forEach(adicionarFase); }
  $a("listaPropostasAnexadas").innerHTML = "";
  contadorBlocosProposta = 0;
  (a.propostasAnexadas || []).forEach((item) => {
    const b = criarBlocoProposta();
    if (item.propostaId) b.querySelector(".campo-select-proposta-existente").value = item.propostaId;
    b.querySelector(".campo-nome-servico-anexado").value = item.nomeServico || "";
    b.querySelector(".campo-forma-pagamento-anexada").value = item.formaPagamento || "";
    b.querySelector(".campo-programacao-anexada").value = item.programacao || "";
    if (item.propostaId) atualizarPreviewProposta(b, buscarProposta(item.propostaId));
  });
  if (!(a.propostasAnexadas || []).length) criarBlocoProposta();
  return a;
}

(async function iniciar() {
  irParaEtapa(1);
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (!id) {
    // Só mostra o próximo número — ele só é usado de verdade ao gerar o PDF
    try {
      numeroReservado = await verNumeracaoAtual("apresentacao");
      $a("campoNumeroDoc").value = String(numeroReservado);
    } catch (e) { /* sem numeração */ }
    return;
  }
  await propostasProntas;
  const a = await carregarApresentacaoPorId(id);
  if (a && params.get("baixar") === "1") {
    irParaEtapa(TOTAL_ETAPAS);
    await gerarPdfApresentacao(coletarDadosApresentacao());
  }
})();

$a("btnConfigNumeracaoApres").addEventListener("click", () => {
  abrirModalConfigNumeracao("apresentacao", "Proposta", (v) => { numeroReservado = v; $a("campoNumeroDoc").value = String(v); });
});
