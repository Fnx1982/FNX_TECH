// ============================================================
// comissao.js
// Comissão calculada sobre o lucro das obras finalizadas —
// % configurável, agrupada por mês/trimestre/semestre/ano.
// Reaproveita lucroMaoDeObraObra/lucroMaterialObra/lucroTotalObra
// de propostas-core.js (mesma conta que já existia nos relatórios).
// ============================================================

const NOMES_MESES_COMISSAO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const NOMES_TRIMESTRES = ["1º Trimestre (Jan-Mar)", "2º Trimestre (Abr-Jun)", "3º Trimestre (Jul-Set)", "4º Trimestre (Out-Dez)"];
const NOMES_SEMESTRES = ["1º Semestre (Jan-Jun)", "2º Semestre (Jul-Dez)"];

let periodoAtivo = "mensal";
let percentualComissao = 10;
let impostosMensais = {}; // { "2026-3": { inss: 11, iss: 5 } }

function formatarMoedaComissao(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function chaveMes(ano, mes) { return `${ano}-${mes}`; } // mes 0-indexado, igual Date.getMonth()

function taxasDoMes(ano, mes) {
  return impostosMensais[chaveMes(ano, mes)] || { inss: 0, iss: 0 };
}

// ── Impostos mensais (INSS/ISS padrão do mês) ────────────────
async function carregarImpostosMensais() {
  try {
    const resp = await apiDataGet("impostosMensaisComissao");
    if (resp.ok && resp.valor) impostosMensais = resp.valor;
  } catch (e) { /* fica vazio, cada mês assume 0% até alguém configurar */ }
}

function popularSelectMesImpostos() {
  const select = document.getElementById("campoMesImpostos");
  const hoje = new Date();
  const opcoes = [];
  // Últimos 24 meses até 3 meses à frente — cobre configurar com antecedência também
  for (let i = -3; i < 24; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    opcoes.push({ ano: d.getFullYear(), mes: d.getMonth(), rotulo: `${NOMES_MESES_COMISSAO[d.getMonth()]} de ${d.getFullYear()}` });
  }
  select.innerHTML = opcoes.map((o) => `<option value="${chaveMes(o.ano, o.mes)}">${o.rotulo}</option>`).join("");
  select.value = chaveMes(hoje.getFullYear(), hoje.getMonth());
  atualizarCamposImpostosMensal();
}

function atualizarCamposImpostosMensal() {
  const [ano, mes] = document.getElementById("campoMesImpostos").value.split("-").map(Number);
  const taxas = taxasDoMes(ano, mes);
  document.getElementById("campoInssMensal").value = taxas.inss;
  document.getElementById("campoIssMensal").value = taxas.iss;
}
document.getElementById("campoMesImpostos").addEventListener("change", atualizarCamposImpostosMensal);

document.getElementById("btnSalvarImpostosMensal").addEventListener("click", async () => {
  const chave = document.getElementById("campoMesImpostos").value;
  const inss = parseFloat(document.getElementById("campoInssMensal").value) || 0;
  const iss = parseFloat(document.getElementById("campoIssMensal").value) || 0;
  impostosMensais[chave] = { ...(impostosMensais[chave] || {}), inss, iss }; // mantém o % de material cadastrado no Orçamento
  const resp = await apiDataSet("impostosMensaisComissao", impostosMensais);
  if (!resp.ok) { mostrarToast(resp.erro || "Erro ao salvar.", "erro"); return; }
  mostrarToast("INSS/ISS do mês salvos.");
  renderResumoPeriodo();
});

// ── Percentual geral ─────────────────────────────────────────
async function carregarPercentual() {
  try {
    const resp = await apiDataGet("comissaoConfig");
    if (resp.ok && resp.valor && resp.valor.percentual !== undefined) {
      percentualComissao = Number(resp.valor.percentual);
    }
  } catch (e) { /* usa o padrão (10) se não conseguir carregar */ }
  document.getElementById("campoPercentualComissao").value = percentualComissao;
}

document.getElementById("btnSalvarPercentual").addEventListener("click", async () => {
  const valor = parseFloat(document.getElementById("campoPercentualComissao").value);
  if (isNaN(valor) || valor < 0 || valor > 100) { mostrarToast("Informe um percentual entre 0 e 100.", "erro"); return; }
  percentualComissao = valor;
  const resp = await apiDataSet("comissaoConfig", { percentual: valor });
  if (!resp.ok) { mostrarToast(resp.erro || "Erro ao salvar.", "erro"); return; }
  mostrarToast("Percentual salvo.");
  renderResumoPeriodo();
});

// ── Seletor de período (muda de cara conforme a aba) ─────────
function renderSeletorPeriodo() {
  const container = document.getElementById("seletorPeriodo");
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  const opcoesAno = anos.map((a) => `<option value="${a}">${a}</option>`).join("");

  if (periodoAtivo === "mensal") {
    container.innerHTML = `
      <select id="seletorMes">${NOMES_MESES_COMISSAO.map((m, i) => `<option value="${i}" ${i === new Date().getMonth() ? "selected" : ""}>${m}</option>`).join("")}</select>
      <select id="seletorAno">${opcoesAno}</select>
    `;
  } else if (periodoAtivo === "trimestral") {
    const trimAtual = Math.floor(new Date().getMonth() / 3);
    container.innerHTML = `
      <select id="seletorTrimestre">${NOMES_TRIMESTRES.map((t, i) => `<option value="${i}" ${i === trimAtual ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select id="seletorAno">${opcoesAno}</select>
    `;
  } else if (periodoAtivo === "semestral") {
    const semAtual = new Date().getMonth() < 6 ? 0 : 1;
    container.innerHTML = `
      <select id="seletorSemestre">${NOMES_SEMESTRES.map((s, i) => `<option value="${i}" ${i === semAtual ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select id="seletorAno">${opcoesAno}</select>
    `;
  } else {
    container.innerHTML = `<select id="seletorAno">${opcoesAno}</select>`;
  }

  container.querySelectorAll("select").forEach((s) => s.addEventListener("change", renderResumoPeriodo));
}

document.querySelectorAll("[data-periodo]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-periodo]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    periodoAtivo = btn.dataset.periodo;
    renderSeletorPeriodo();
    renderResumoPeriodo();
  });
});

// ── Filtra as obras finalizadas dentro do período escolhido ──
function obrasNoPeriodo() {
  const ano = parseInt(document.getElementById("seletorAno").value, 10);
  const finalizadas = lerObrasFinaliz().filter((o) => o.dataFinalizacao);

  return finalizadas.filter((o) => {
    const data = new Date(o.dataFinalizacao);
    if (data.getFullYear() !== ano) return false;

    if (periodoAtivo === "mensal") {
      const mes = parseInt(document.getElementById("seletorMes").value, 10);
      return data.getMonth() === mes;
    }
    if (periodoAtivo === "trimestral") {
      const trim = parseInt(document.getElementById("seletorTrimestre").value, 10);
      return Math.floor(data.getMonth() / 3) === trim;
    }
    if (periodoAtivo === "semestral") {
      const sem = parseInt(document.getElementById("seletorSemestre").value, 10);
      return (data.getMonth() < 6 ? 0 : 1) === sem;
    }
    return true; // anual — só o ano já filtrou
  });
}

// Impostos de uma obra: usa o percentual específico dela, se tiver
// sido definido — senão cai no percentual geral do mês em que ela
// foi finalizada (cada obra olha o mês dela, então isso já funciona
// certo mesmo dentro de um período maior, tipo trimestre).
function impostosDaObra(obra) {
  const data = new Date(obra.dataFinalizacao);
  const taxasMes = taxasDoMes(data.getFullYear(), data.getMonth());
  const inssPerc = obra.inssPercentualObra !== null && obra.inssPercentualObra !== undefined ? obra.inssPercentualObra : taxasMes.inss;
  const issPerc = obra.issPercentualObra !== null && obra.issPercentualObra !== undefined ? obra.issPercentualObra : taxasMes.iss;
  const baseCalculo = obra.valorMaoDeObraOrcamento || 0; // INSS/ISS incidem só sobre Mão de obra, não Material
  const valorInss = baseCalculo * (inssPerc / 100);
  const valorIss = baseCalculo * (issPerc / 100);
  return { inssPerc, issPerc, valorInss, valorIss, totalImpostos: valorInss + valorIss };
}

// Lucro líquido de uma obra: lucro bruto menos INSS/ISS — nunca
// fica negativo por causa do imposto (se o lucro já era negativo,
// continua igual, o imposto não piora além disso).
function lucroLiquidoDaObra(obra) {
  const bruto = lucroTotalObra(obra);
  const { totalImpostos } = impostosDaObra(obra);
  return bruto > 0 ? bruto - totalImpostos : bruto;
}

// Comissão de uma obra: lucro líquido (já descontado INSS/ISS) × %,
// mas nunca negativa — obra com prejuízo não gera comissão negativa,
// fica zerada.
function comissaoDaObra(obra) {
  const lucro = lucroLiquidoDaObra(obra);
  return lucro > 0 ? lucro * (percentualComissao / 100) : 0;
}

function tituloPeriodoAtual() {
  const ano = document.getElementById("seletorAno").value;
  if (periodoAtivo === "mensal") return `${NOMES_MESES_COMISSAO[document.getElementById("seletorMes").value]} de ${ano}`;
  if (periodoAtivo === "trimestral") return `${NOMES_TRIMESTRES[document.getElementById("seletorTrimestre").value]} de ${ano}`;
  if (periodoAtivo === "semestral") return `${NOMES_SEMESTRES[document.getElementById("seletorSemestre").value]} de ${ano}`;
  return `Ano de ${ano}`;
}

// ── Renderização ──────────────────────────────────────────────
function renderResumoPeriodo() {
  const obras = obrasNoPeriodo();
  const lucroTotal = obras.reduce((s, o) => s + lucroTotalObra(o), 0);
  const impostosTotal = obras.reduce((s, o) => s + impostosDaObra(o).totalImpostos, 0);
  const lucroLiquidoTotal = obras.reduce((s, o) => s + lucroLiquidoDaObra(o), 0);
  const comissaoTotal = obras.reduce((s, o) => s + comissaoDaObra(o), 0);

  document.getElementById("tituloResumoPeriodo").textContent = `Resumo — ${tituloPeriodoAtual()}`;
  document.getElementById("resumoQtdObras").textContent = obras.length;
  document.getElementById("resumoLucroTotal").textContent = formatarMoedaComissao(lucroTotal);
  document.getElementById("resumoImpostosTotal").textContent = formatarMoedaComissao(impostosTotal);
  document.getElementById("resumoLucroLiquido").textContent = formatarMoedaComissao(lucroLiquidoTotal);
  document.getElementById("resumoComissaoTotal").textContent = formatarMoedaComissao(comissaoTotal);

  const listaEl = document.getElementById("listaObrasComissao");
  const semObrasEl = document.getElementById("semObrasComissao");

  if (obras.length === 0) {
    listaEl.innerHTML = "";
    semObrasEl.style.display = "block";
  } else {
    semObrasEl.style.display = "none";
    listaEl.innerHTML = obras.map((o) => {
      const lucroBruto = lucroTotalObra(o);
      const { inssPerc, issPerc, totalImpostos } = impostosDaObra(o);
      const lucroLiquido = lucroLiquidoDaObra(o);
      const comissao = comissaoDaObra(o);
      const dataFmt = new Date(o.dataFinalizacao).toLocaleDateString("pt-BR");
      return `
        <div class="card-obra-comissao">
          <div class="card-obra-comissao-info">
            <strong>${escaparHtml(o.cliente) || "(sem cliente)"} — ${escaparHtml(o.servico) || ""}</strong>
            <span>Finalizada em ${dataFmt} · Mão de obra: ${formatarMoedaComissao(o.valorMaoDeObraOrcamento)}</span>
            <div class="card-obra-comissao-impostos">
              <label>INSS % <input type="number" min="0" max="100" step="0.1" data-inss-obra="${o.id}" value="${inssPerc}" placeholder="mês" /></label>
              <label>ISS % <input type="number" min="0" max="100" step="0.1" data-iss-obra="${o.id}" value="${issPerc}" placeholder="mês" /></label>
              <span class="valor-negativo">− ${formatarMoedaComissao(totalImpostos)}</span>
            </div>
          </div>
          <div class="card-obra-comissao-valores">
            <div><span>Lucro líquido</span><span class="${lucroLiquido >= 0 ? "valor-positivo" : "valor-negativo"}">${formatarMoedaComissao(lucroLiquido)}</span></div>
            <div><span>Comissão</span><span>${formatarMoedaComissao(comissao)}</span></div>
          </div>
        </div>
      `;
    }).join("");

    // Salva a sobrescrita por obra quando a pessoa edita o campo e sai dele
    listaEl.querySelectorAll("[data-inss-obra], [data-iss-obra]").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.dataset.inssObra || input.dataset.issObra;
        const obra = buscarObra(id);
        const valor = input.value === "" ? null : parseFloat(input.value);
        if (input.dataset.inssObra) obra.inssPercentualObra = valor;
        else obra.issPercentualObra = valor;
        await salvarObra(obra);
        renderResumoPeriodo();
      });
    });
  }

  renderObrasSemData();
}

// ── Obras finalizadas sem dataFinalizacao (legado) ──────────
function renderObrasSemData() {
  const semData = lerObrasFinaliz().filter((o) => !o.dataFinalizacao);
  const secao = document.getElementById("secaoObrasSemData");
  const lista = document.getElementById("listaObrasSemData");

  if (semData.length === 0) { secao.style.display = "none"; return; }
  secao.style.display = "block";

  lista.innerHTML = semData.map((o) => `
    <div class="card-obra-comissao">
      <div class="card-obra-comissao-info">
        <strong>${escaparHtml(o.cliente) || "(sem cliente)"} — ${escaparHtml(o.servico) || ""}</strong>
        <span>Lucro: ${formatarMoedaComissao(lucroTotalObra(o))}</span>
      </div>
      <div class="card-obra-comissao-backfill">
        <input type="date" data-backfill="${o.id}" />
        <button type="button" class="btn-laranja" data-confirmar-backfill="${o.id}">Definir data</button>
      </div>
    </div>
  `).join("");

  lista.querySelectorAll("[data-confirmar-backfill]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.confirmarBackfill;
      const campoData = lista.querySelector(`[data-backfill="${id}"]`);
      if (!campoData.value) { mostrarToast("Escolha uma data primeiro.", "erro"); return; }
      const obra = buscarObra(id);
      obra.dataFinalizacao = new Date(campoData.value + "T12:00:00").toISOString();
      await salvarObra(obra);
      mostrarToast("Data definida — a obra já entra nos relatórios agora.");
      renderResumoPeriodo();
    });
  });
}

// ── PDF do período ────────────────────────────────────────────
document.getElementById("btnGerarPdfComissao").addEventListener("click", () => {
  const obras = obrasNoPeriodo();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const ML = 50, MR = 50;
  const PW = doc.internal.pageSize.getWidth();
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Relatório de Comissão", ML, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(tituloPeriodoAtual(), ML, y);
  y += 12;
  doc.text(`Percentual de comissão: ${percentualComissao}%`, ML, y);
  y += 24;

  const linhas = obras.map((o) => {
    const lucroBruto = lucroTotalObra(o);
    const { totalImpostos } = impostosDaObra(o);
    const lucroLiquido = lucroLiquidoDaObra(o);
    return [
      `${o.cliente || "-"} — ${o.servico || ""}`,
      new Date(o.dataFinalizacao).toLocaleDateString("pt-BR"),
      formatarMoedaComissao(lucroBruto),
      formatarMoedaComissao(totalImpostos),
      formatarMoedaComissao(lucroLiquido),
      formatarMoedaComissao(comissaoDaObra(o)),
    ];
  });

  doc.autoTable({
    startY: y,
    head: [["Obra", "Finalizada em", "Lucro Bruto", "INSS+ISS", "Lucro Líquido", "Comissão"]],
    body: linhas.length ? linhas : [["Nenhuma obra finalizada nesse período.", "-", "-", "-", "-", "-"]],
    headStyles: { fillColor: [255, 106, 0] },
    styles: { fontSize: 8.5 },
    margin: { left: ML, right: MR },
  });
  y = doc.lastAutoTable.finalY + 20;

  const lucroTotal = obras.reduce((s, o) => s + lucroTotalObra(o), 0);
  const impostosTotal = obras.reduce((s, o) => s + impostosDaObra(o).totalImpostos, 0);
  const lucroLiquidoTotal = obras.reduce((s, o) => s + lucroLiquidoDaObra(o), 0);
  const comissaoTotal = obras.reduce((s, o) => s + comissaoDaObra(o), 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Lucro bruto total: ${formatarMoedaComissao(lucroTotal)}`, PW - MR - 220, y);
  y += 14;
  doc.text(`INSS + ISS total: ${formatarMoedaComissao(impostosTotal)}`, PW - MR - 220, y);
  y += 14;
  doc.text(`Lucro líquido total: ${formatarMoedaComissao(lucroLiquidoTotal)}`, PW - MR - 220, y);
  y += 16;
  doc.setFontSize(12);
  doc.text(`Comissão total: ${formatarMoedaComissao(comissaoTotal)}`, PW - MR - 220, y);

  doc.save(`Comissao_${tituloPeriodoAtual().replace(/\s+/g, "_")}.pdf`);
});

// ── Inicialização ────────────────────────────────────────────
(async function inicializarComissao() {
  await carregarObrasCache();
  await carregarPercentual();
  await carregarImpostosMensais();
  popularSelectMesImpostos();
  renderSeletorPeriodo();
  renderResumoPeriodo();
})();