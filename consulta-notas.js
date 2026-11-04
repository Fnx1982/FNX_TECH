// ============================================================
// consulta-notas.js — visão unificada de todas as notas fiscais
// (NF-e + NFS-e), com filtro por tipo, busca, detalhes, baixar
// PDF e excluir.
// ============================================================

let todasAsNotas = [];
let filtroTipoAtual = "todas"; // "todas" | "NF-e" | "NFS-e"
let dadosEmpresaConsulta = null; // carregado uma vez, usado no PDF e nos detalhes

const WORKER_URL_CONSULTA = FNX_API;

async function carregarDadosEmpresaConsulta() {
  try {
    const resposta = await apiDataGet("empresaFiscal");
    dadosEmpresaConsulta = (resposta.ok && resposta.valor) ? resposta.valor : null;
  } catch (e) { /* sem conexão — usa null, o PDF cai pro texto padrão */ }
}

function uploadBlobParaArmazenamento(chave, blob, contentType) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL_CONSULTA}?action=put&key=${encodeURIComponent(chave)}`);
    xhr.setRequestHeader("Content-Type", contentType);
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = () => { if (xhr.status < 300) resolve(); else reject(new Error("Falha ao salvar no Drive (" + xhr.status + ")")); };
    xhr.onerror = () => reject(new Error("Falha de conexão ao salvar no Drive"));
    xhr.send(blob);
  });
}

function formatarMoedaConsulta(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Calcula os totais de uma nota, usando os campos estruturados de
// verdade quando existem (notas criadas pelas telas novas de
// NF-e/NFS-e). Pra alguma nota antiga que só tenha o "impostos" em %
// genérico (do jeito antigo), cai num cálculo mais simples, só pra
// não quebrar — mas o normal, daqui pra frente, é sempre ter
// dadosEstruturados.
function calcularTotalNota(nota) {
  const subtotal = (nota.itens || []).reduce((s, i) => s + (i.quantidade || 0) * (i.valorUnitario || 0), 0);
  const de = nota.dadosEstruturados || {};
  const num = (v) => Number(v) || 0;

  if (!nota.dadosEstruturados) {
    // Nota antiga, do modelo genérico anterior.
    const totalImpostos = (nota.impostos || []).reduce((s, i) => s + subtotal * ((i.percentual || 0) / 100), 0);
    return { subtotal, totalImpostos, total: subtotal + totalImpostos, baseCalculo: subtotal, valorIss: 0 };
  }

  if (nota.tipo === "NFS-e") {
    const descCond = num(de.campoDescCondicional);
    const descIncond = num(de.campoDescIncondicional);
    const deducoes = num(de.campoDeducoes);
    const baseCalculo = Math.max(0, subtotal - descCond - descIncond - deducoes);
    const aliqIss = num(de.campoAliqIss);
    const valorIss = baseCalculo * (aliqIss / 100);
    const issRetido = de.campoIssRetido === "SIM";
    const totalRetencoes = num(de.campoInssRetido) + num(de.campoIrrfRetido) + num(de.campoPisCofinsCsllRetidos) + num(de.campoOutrasRetencoes) + (issRetido ? valorIss : 0);
    return { subtotal, totalImpostos: totalRetencoes, total: subtotal - totalRetencoes, baseCalculo, valorIss };
  }

  // NF-e
  const extras = num(de.campoValorIpi) + num(de.campoValorFrete) + num(de.campoValorSeguro) + num(de.campoOutrasDespesas) - num(de.campoDesconto);
  return { subtotal, totalImpostos: extras, total: subtotal + extras, baseCalculo: subtotal, valorIss: 0 };
}


// Gera o PDF de uma nota fiscal (NF-e ou NFS-e) — layout simples,
// com a logo real e os dados do tomador/itens/impostos.
function gerarPdfNotaFiscal(nota) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;
  const larguraUtil = doc.internal.pageSize.getWidth() - margem * 2;
  let y = 40;

  const emp = dadosEmpresaConsulta || {};
  const larguraLogo = 140;
  const alturaLogo = larguraLogo / (typeof LOGO_EMPRESA_PROPORCAO !== "undefined" ? LOGO_EMPRESA_PROPORCAO : 3.35);
  try {
    if (typeof LOGO_EMPRESA_BASE64 !== "undefined" && LOGO_EMPRESA_BASE64) doc.addImage(LOGO_EMPRESA_BASE64, "JPEG", margem, y - 6, larguraLogo, alturaLogo);
  } catch (e) { console.warn("[consulta-notas] logo não pôde ser desenhada:", e); }

  const xTexto = margem + larguraLogo + 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(emp.razaoSocial || FNX_EMPRESA.razaoSocial, xTexto, y + 6);
  doc.text(`${emp.endereco || ""} — ${emp.municipio || ""}/${emp.uf || ""}`, xTexto, y + 18);
  doc.text(`CNPJ: ${emp.cnpj || ""}${nota.tipo === "NFS-e" && emp.inscMunicipal ? "  |  Insc. Municipal: " + emp.inscMunicipal : ""}`, xTexto, y + 30);

  y = Math.max(y + 30, y - 6 + alturaLogo) + 16;
  doc.setDrawColor(235, 153, 28);
  doc.setLineWidth(1.2);
  doc.line(margem, y, margem + larguraUtil, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(nota.tipo === "NF-e" ? "NOTA FISCAL DE PRODUTOS (rascunho/conferência)" : "NOTA FISCAL DE SERVIÇO (rascunho/conferência)", margem, y + 14);
  y += 30;

  // ── Dados do Tomador/Destinatário ──────────────────────────
  doc.setFontSize(10);
  const linhaCampo = (rotulo, valor) => {
    doc.setFont("helvetica", "bold"); doc.text(rotulo, margem, y);
    doc.setFont("helvetica", "normal"); doc.text(valor || "-", margem + 130, y);
    y += 15;
  };
  linhaCampo("Cliente/Tomador:", nota.tomadorNome);
  linhaCampo("Documento:", nota.tomadorDocumento);
  linhaCampo("Endereço:", nota.tomadorEndereco);
  const municipioTomador = [nota.tomadorMunicipio, nota.tomadorUf].filter(Boolean).join("/");
  if (municipioTomador) linhaCampo("Município:", municipioTomador + (nota.tomadorCep ? " — CEP " + nota.tomadorCep : ""));
  if (nota.tomadorInscMunicipal) linhaCampo("Insc. Municipal:", nota.tomadorInscMunicipal);
  if (nota.tomadorInscEstadual) linhaCampo("Insc. Estadual:", nota.tomadorInscEstadual);
  y += 10;

  // ── Itens ───────────────────────────────────────────────────
  const de = nota.dadosEstruturados || {};
  const ehNFe = nota.tipo === "NF-e";
  const linhasItens = (nota.itens || []).map((i) => ehNFe
    ? [i.codigo || "-", i.descricao, i.ncm || "-", i.cfop || "-", String(i.quantidade || 0), formatarMoedaConsulta(i.valorUnitario), formatarMoedaConsulta((i.quantidade || 0) * (i.valorUnitario || 0))]
    : [i.descricao, String(i.quantidade || 0), formatarMoedaConsulta(i.valorUnitario), formatarMoedaConsulta((i.quantidade || 0) * (i.valorUnitario || 0))]
  );
  doc.autoTable({
    startY: y,
    head: [ehNFe ? ["Código", "Descrição", "NCM", "CFOP", "Qtd.", "Valor Unit.", "Total"] : ["Descrição", "Qtd.", "Valor Unit.", "Total"]],
    body: linhasItens.length ? linhasItens : [Array(ehNFe ? 7 : 4).fill("-")],
    headStyles: { fillColor: [255, 106, 0] },
    styles: { fontSize: 8.5 },
    margin: { left: margem, right: margem },
  });
  y = doc.lastAutoTable.finalY + 16;

  // ── Tributação (o que existir de dadosEstruturados) ─────────
  if (nota.dadosEstruturados) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(nota.tipo === "NFS-e" ? "Tributação de ISSQN" : "Cálculo do Imposto", margem, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const camposResumo = nota.tipo === "NFS-e"
      ? [["Natureza da Operação", de.campoNaturezaOperacao], ["ISS Retido", de.campoIssRetido], ["Local de Prestação", de.campoLocalPrestacao], ["Município de Incidência", de.campoMunicipioIncidencia], ["Alíquota ISS", de.campoAliqIss ? de.campoAliqIss + "%" : null]]
      : [["Natureza da Operação", de.campoNaturezaOperacao], ["BC ICMS", de.campoBcIcms ? formatarMoedaConsulta(de.campoBcIcms) : null], ["Valor ICMS", de.campoValorIcms ? formatarMoedaConsulta(de.campoValorIcms) : null], ["Valor IPI", de.campoValorIpi ? formatarMoedaConsulta(de.campoValorIpi) : null]];
    camposResumo.filter(([, v]) => v).forEach(([rotulo, valor]) => {
      doc.text(`${rotulo}: ${valor}`, margem, y);
      y += 12;
    });
    y += 8;
  }

  // ── Totais ────────────────────────────────────────────────
  const { subtotal, baseCalculo, valorIss, totalImpostos, total } = calcularTotalNota(nota);
  doc.setFontSize(10);
  doc.text(`${ehNFe ? "Valor Total dos Produtos" : "Valor do Serviço"}: ${formatarMoedaConsulta(subtotal)}`, margem + larguraUtil - 220, y);
  y += 14;
  if (!ehNFe) {
    doc.text(`Base de Cálculo: ${formatarMoedaConsulta(baseCalculo)}`, margem + larguraUtil - 220, y);
    y += 14;
    doc.text(`Valor ISS: ${formatarMoedaConsulta(valorIss)}`, margem + larguraUtil - 220, y);
    y += 14;
  }
  doc.text(`${ehNFe ? "Impostos/Frete/Desconto" : "Total de Retenções"}: ${formatarMoedaConsulta(totalImpostos)}`, margem + larguraUtil - 220, y);
  y += 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(`${ehNFe ? "Valor Total da Nota" : "Valor Líquido"}: ${formatarMoedaConsulta(total)}`, margem + larguraUtil - 220, y);

  if (nota.observacoes) {
    y += 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Informações Complementares:", margem, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    const linhasObs = doc.splitTextToSize(nota.observacoes, larguraUtil);
    doc.text(linhasObs, margem, y);
  }

  if (nota.status === "cancelada") {
    doc.setTextColor(220, 20, 60);
    doc.setFontSize(40);
    doc.text("CANCELADA", 150, 450, { angle: 35 });
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}

// Baixa o PDF no computador do usuário E arquiva uma cópia no
// Armazenamento (pasta "Notas Fiscais/NF-e" ou ".../NFS-e"), pra
// ficar organizado e com backup — sem precisar de ação manual.
async function baixarEArquivarNotaFiscal(nota) {
  const doc = gerarPdfNotaFiscal(nota);
  const nomeArquivo = `${nota.tipo}_${nota.tomadorNome.replace(/[^a-z0-9]+/gi, "-")}_${nota.id}.pdf`;

  doc.save(nomeArquivo);

  try {
    const blob = doc.output("blob");
    const chave = `Notas Fiscais/${nota.tipo}/${nomeArquivo}`;
    await uploadBlobParaArmazenamento(chave, blob, "application/pdf");
    mostrarToast("PDF baixado e arquivado no Drive.");
  } catch (e) {
    // O download já aconteceu — o arquivamento é um "extra", se falhar
    // não deve parecer que a ação toda deu errado.
    console.warn("[consulta-notas] Não foi possível arquivar no Drive:", e);
    mostrarToast("PDF baixado (mas não foi possível arquivar automaticamente no Drive).", "erro");
  }
}

async function carregarConsulta() {
  const resposta = await apiListarNotasFiscais();
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao carregar notas.", "erro"); return; }
  // Só mostra notas que JÁ foram emitidas (ou canceladas, que também
  // passaram por emissão em algum momento) — rascunhos ainda em
  // conferência ficam só nas telas de NF-e/NFS-e.
  todasAsNotas = resposta.notas.filter((n) => n.status === "emitida" || n.status === "cancelada");
  renderizarConsulta();
}

function renderizarConsulta() {
  const busca = document.getElementById("buscaConsulta").value.trim().toLowerCase();
  let filtradas = todasAsNotas;
  if (filtroTipoAtual !== "todas") filtradas = filtradas.filter((n) => n.tipo === filtroTipoAtual);
  if (busca) filtradas = filtradas.filter((n) => (n.tomadorNome || "").toLowerCase().includes(busca));

  filtradas = [...filtradas].sort((a, b) => (b.atualizadoEm || b.criadoEm || 0) - (a.atualizadoEm || a.criadoEm || 0));

  const lista = document.getElementById("listaConsulta");
  const vazio = document.getElementById("vazioConsulta");
  lista.innerHTML = "";

  if (filtradas.length === 0) { vazio.style.display = "block"; return; }
  vazio.style.display = "none";

  filtradas.forEach((nota) => {
    const { total } = calcularTotalNota(nota);
    const el = document.createElement("div");
    el.className = "item-nota-fiscal";
    el.innerHTML = `
      <div>
        <div class="nome-tomador">
          ${escaparHtml(nota.tomadorNome)}
          <span class="badge-status ${nota.status}">${nota.status}</span>
          <span class="badge-status" style="background:#EDEDED;color:#555;">${nota.tipo}</span>
        </div>
        <div class="meta">${(nota.itens || []).length} item(ns) · ${new Date(nota.atualizadoEm || nota.criadoEm).toLocaleString("pt-BR")}</div>
      </div>
      <div class="valor">${formatarMoedaConsulta(total)}</div>
      <div class="acoes">
        <button class="btn-detalhes-consulta">Detalhes</button>
        <button class="btn-baixar-consulta">⬇ Baixar PDF</button>
        <button class="btn-excluir-nota">Excluir</button>
      </div>
    `;

    const painelDetalhes = document.createElement("div");
    painelDetalhes.style.cssText = "display:none;padding:14px 18px;background:#fafafa;border-top:1px solid #eee;font-size:13px;";
    const linhasItens = (nota.itens || []).map((i) =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0;">
        <span>${escaparHtml(i.descricao)} (${i.quantidade}×${formatarMoedaConsulta(i.valorUnitario)})</span>
        <span>${formatarMoedaConsulta((i.quantidade || 0) * (i.valorUnitario || 0))}</span>
      </div>`
    ).join("");
    const municipioTomadorHtml = [nota.tomadorMunicipio, nota.tomadorUf].filter(Boolean).join("/");
    const { baseCalculo, valorIss } = calcularTotalNota(nota);
    painelDetalhes.innerHTML = `
      <div><b>Documento:</b> ${escaparHtml(nota.tomadorDocumento) || "—"}</div>
      <div><b>Endereço:</b> ${escaparHtml(nota.tomadorEndereco) || "—"}</div>
      ${municipioTomadorHtml ? `<div><b>Município:</b> ${escaparHtml(municipioTomadorHtml)}${nota.tomadorCep ? " — CEP " + escaparHtml(nota.tomadorCep) : ""}</div>` : ""}
      ${nota.tomadorInscMunicipal ? `<div><b>Insc. Municipal:</b> ${escaparHtml(nota.tomadorInscMunicipal)}</div>` : ""}
      ${nota.tomadorInscEstadual ? `<div><b>Insc. Estadual:</b> ${escaparHtml(nota.tomadorInscEstadual)}</div>` : ""}
      ${nota.tipo === "NFS-e" && nota.dadosEstruturados ? `<div style="margin-top:6px;"><b>Base de Cálculo:</b> ${formatarMoedaConsulta(baseCalculo)} · <b>Valor ISS:</b> ${formatarMoedaConsulta(valorIss)}</div>` : ""}
      ${nota.motivoCancelamento ? `<div style="color:var(--vermelho);"><b>Motivo do cancelamento:</b> ${escaparHtml(nota.motivoCancelamento)}</div>` : ""}
      <div style="margin-top:8px;"><b>Itens:</b></div>
      ${linhasItens || "<div>Nenhum item.</div>"}
    `;

    el.querySelector(".btn-detalhes-consulta").addEventListener("click", () => {
      const aberto = painelDetalhes.style.display === "block";
      painelDetalhes.style.display = aberto ? "none" : "block";
    });

    el.querySelector(".btn-baixar-consulta").addEventListener("click", async () => {
      const botao = el.querySelector(".btn-baixar-consulta");
      const textoOriginal = botao.textContent;
      botao.disabled = true;
      botao.textContent = "Gerando...";
      try {
        await baixarEArquivarNotaFiscal(nota);
      } catch (e) {
        mostrarToast("Erro ao gerar o PDF: " + e.message, "erro");
      } finally {
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    });

    el.querySelector(".btn-excluir-nota").addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir a nota de "${nota.tomadorNome}"?`, "");
      if (!ok) return;
      const resp = await apiExcluirNotaFiscal(nota.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
      mostrarToast("Excluída.");
      carregarConsulta();
    });

    lista.appendChild(el);
    lista.appendChild(painelDetalhes);
  });
}

// ── Abas de filtro ────────────────────────────────────────────
function aplicarFiltro(tipo, botaoAtivo) {
  filtroTipoAtual = tipo;
  [btnFiltroTodas, btnFiltroNfe, btnFiltroNfse].forEach((b) => {
    b.style.background = "transparent";
    b.style.color = "#666";
  });
  botaoAtivo.style.background = "var(--laranja, rgb(255, 106, 0))";
  botaoAtivo.style.color = "#fff";
  renderizarConsulta();
}

const btnFiltroTodas = document.getElementById("btnFiltroTodas");
const btnFiltroNfe = document.getElementById("btnFiltroNfe");
const btnFiltroNfse = document.getElementById("btnFiltroNfse");

btnFiltroTodas.addEventListener("click", () => aplicarFiltro("todas", btnFiltroTodas));
btnFiltroNfe.addEventListener("click", () => aplicarFiltro("NF-e", btnFiltroNfe));
btnFiltroNfse.addEventListener("click", () => aplicarFiltro("NFS-e", btnFiltroNfse));

document.getElementById("buscaConsulta").addEventListener("input", renderizarConsulta);

carregarDadosEmpresaConsulta();
carregarConsulta();