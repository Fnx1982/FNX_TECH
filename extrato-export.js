// ============================================================
// extrato-export.js — gera Excel, PDF, OFX, CNAB240 e impressão
// a partir de uma lista de lançamentos. Compartilhado pelas 3
// páginas de banco (Sicredi, Inter, Credcrea).
//
// IMPORTANTE sobre CNAB240: esse formato, na vida real, é usado
// pra ENVIAR instruções de pagamento pro banco (remessa) — não é
// um formato pensado pra "exportar um extrato". Gerar aqui um
// arquivo no layout CNAB240 a partir dos lançamentos é útil pra
// conciliação/organização interna, mas esse arquivo NÃO deve ser
// enviado a um banco de verdade sem antes validar com o manual
// técnico oficial daquele banco — cada banco tem exigências
// próprias de código de convênio, layout de segmento, etc.
// ============================================================

function formatarMoedaBR(valor) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function somenteNumeros(str) {
  return (str || "").replace(/\D/g, "");
}

function formatarDataAAAAMMDD(dataIso) {
  return (dataIso || "").replace(/-/g, "");
}

function nomeArquivoExtrato(nomeBanco, extensao) {
  const hoje = new Date().toISOString().slice(0, 10);
  return `extrato_${nomeBanco.toLowerCase()}_${hoje}.${extensao}`;
}

// ── Excel (.xlsx) — usa a biblioteca SheetJS (precisa estar carregada) ──
function gerarExcelExtrato(lancamentos, nomeBanco) {
  const linhas = lancamentos.map((l) => ({
    Data: l.data,
    Descrição: l.descricao,
    Classificação: l.classificacao || "",
    Observação: l.observacao || "",
    Tipo: l.tipo === "entrada" ? "Entrada" : "Saída",
    Valor: l.tipo === "entrada" ? l.valor : -l.valor,
  }));
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Extrato");
  XLSX.writeFile(livro, nomeArquivoExtrato(nomeBanco, "xlsx"));
}

// ── PDF — usa jsPDF + autoTable (precisam estar carregados) ──────
function gerarPdfExtrato(lancamentos, nomeBanco) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Extrato Bancário — ${nomeBanco}`, margem, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margem, 56);

  const totalEntrada = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const totalSaida = lancamentos.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);

  const linhas = lancamentos.map((l) => [
    new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR"),
    l.descricao,
    l.classificacao || "-",
    l.tipo === "entrada" ? "Entrada" : "Saída",
    (l.tipo === "entrada" ? "" : "-") + "R$ " + formatarMoedaBR(l.valor),
  ]);

  doc.autoTable({
    startY: 72,
    head: [["Data", "Descrição", "Classificação", "Tipo", "Valor"]],
    body: linhas.length ? linhas : [["-", "Nenhum lançamento no período/filtro atual.", "-", "-", "-"]],
    headStyles: { fillColor: [255, 106, 0] },
    margin: { left: margem, right: margem },
  });

  const y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold");
  doc.text(`Entradas: R$ ${formatarMoedaBR(totalEntrada)}`, margem, y);
  doc.text(`Saídas: R$ ${formatarMoedaBR(totalSaida)}`, margem, y + 16);
  doc.text(`Saldo: R$ ${formatarMoedaBR((totalEntrada - totalSaida))}`, margem, y + 32);

  doc.save(nomeArquivoExtrato(nomeBanco, "pdf"));
}

// ── OFX (Open Financial Exchange, layout 1.02 SGML) ──────────────
function gerarOfxExtrato(lancamentos, nomeBanco, dadosConta) {
  const agora = new Date();
  const dtServer = agora.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const datas = lancamentos.map((l) => l.data).sort();
  const dtStart = datas.length ? formatarDataAAAAMMDD(datas[0]) : formatarDataAAAAMMDD(agora.toISOString().slice(0, 10));
  const dtEnd = datas.length ? formatarDataAAAAMMDD(datas[datas.length - 1]) : dtStart;

  const saldo = lancamentos.reduce((s, l) => s + (l.tipo === "entrada" ? l.valor : -l.valor), 0);

  const transacoes = lancamentos.map((l, idx) => {
    const valor = l.tipo === "entrada" ? l.valor : -l.valor;
    return `<STMTTRN>
<TRNTYPE>${l.tipo === "entrada" ? "CREDIT" : "DEBIT"}
<DTPOSTED>${formatarDataAAAAMMDD(l.data)}
<TRNAMT>${valor.toFixed(2)}
<FITID>${formatarDataAAAAMMDD(l.data)}${String(idx).padStart(4, "0")}
<MEMO>${(l.descricao || "").slice(0, 200)}
</STMTTRN>`;
  }).join("\n");

  const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${dtServer}
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>${dadosConta.banco || "0000"}
<BRANCHID>${dadosConta.agencia || "0000"}
<ACCTID>${dadosConta.conta || "00000-0"}
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dtStart}
<DTEND>${dtEnd}
${transacoes}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>${saldo.toFixed(2)}
<DTASOF>${dtEnd}
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  baixarArquivoTexto(ofx, nomeArquivoExtrato(nomeBanco, "ofx"), "application/x-ofx");
}

// ── CNAB240 — layout FEBRABAN básico (header/trailer de arquivo e
// de lote). Ver aviso no topo do arquivo sobre o uso real disso. ──
function preencherCampo(valor, tamanho, alinhamento = "esquerda", preenchimento = " ") {
  valor = String(valor ?? "");
  if (valor.length > tamanho) valor = valor.slice(0, tamanho);
  const faltam = tamanho - valor.length;
  const pad = preenchimento.repeat(faltam);
  return alinhamento === "esquerda" ? valor + pad : pad + valor;
}
function campoNumerico(valor, tamanho) {
  return preencherCampo(String(valor ?? "0").replace(/\D/g, "") || "0", tamanho, "direita", "0");
}

function gerarCnab240Extrato(lancamentos, nomeBanco, dadosConta) {
  const linhas = [];
  const codigoBanco = campoNumerico(dadosConta.banco || "0", 3);
  const agencia = campoNumerico(dadosConta.agencia || "0", 5);
  const conta = campoNumerico((dadosConta.conta || "0").replace("-", ""), 12);
  const hoje = new Date();
  const dataGeracao = `${String(hoje.getDate()).padStart(2, "0")}${String(hoje.getMonth() + 1).padStart(2, "0")}${hoje.getFullYear()}`;

  // Header de Arquivo (registro 0)
  linhas.push(
    codigoBanco + "0000" + "0" + preencherCampo("", 9) +
    "2" + preencherCampo("", 14) + campoNumerico("", 15) +
    preencherCampo(nomeBanco.toUpperCase(), 30) +
    preencherCampo("FNX TECH", 30) +
    preencherCampo("", 10) + "1" + dataGeracao + preencherCampo("", 6) +
    campoNumerico("1", 6) + preencherCampo("", 10) + preencherCampo("", 69) + campoNumerico("1", 5)
  );

  // Header de Lote (registro 1)
  linhas.push(
    codigoBanco + "0001" + "1" + "C" + "98" + "01" + preencherCampo("", 2) +
    "2" + campoNumerico("", 15) + preencherCampo("", 15) +
    preencherCampo("FNX TECH", 30) + preencherCampo("", 40) + preencherCampo("", 40) + preencherCampo("", 8) + preencherCampo("", 148)
  );

  // Segmento — um "detalhe" por lançamento (representando o extrato,
  // não uma remessa de pagamento real)
  lancamentos.forEach((l, idx) => {
    const valorCentavos = campoNumerico(Math.round(l.valor * 100), 15);
    linhas.push(
      codigoBanco + "0001" + "3" + campoNumerico(idx + 1, 5) + "A" + preencherCampo("", 1) +
      (l.tipo === "entrada" ? "C" : "D") + agencia + conta + preencherCampo("", 1) +
      preencherCampo((l.descricao || "").toUpperCase(), 30) + formatarDataAAAAMMDD(l.data) +
      "BRL" + preencherCampo("", 15) + valorCentavos + preencherCampo("", 20) + preencherCampo("", 40)
    );
  });

  // Trailer de Lote
  linhas.push(
    codigoBanco + "0001" + "5" + preencherCampo("", 9) +
    campoNumerico(lancamentos.length + 2, 6) + campoNumerico("0", 18) + campoNumerico("0", 18) + preencherCampo("", 165)
  );

  // Trailer de Arquivo
  linhas.push(
    codigoBanco + "9999" + "9" + preencherCampo("", 9) +
    campoNumerico("1", 6) + campoNumerico(lancamentos.length + 4, 6) + preencherCampo("", 205)
  );

  const conteudo = linhas.map((l) => preencherCampo(l, 240)).join("\r\n");
  baixarArquivoTexto(conteudo, nomeArquivoExtrato(nomeBanco, "txt"), "text/plain");
}

function baixarArquivoTexto(conteudo, nomeArquivo, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Impressão ────────────────────────────────────────────────────
function imprimirExtrato(lancamentos, nomeBanco) {
  const totalEntrada = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const totalSaida = lancamentos.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);

  const linhasHtml = lancamentos.map((l) => `
    <tr>
      <td>${new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
      <td>${l.descricao}</td>
      <td>${l.classificacao || "-"}</td>
      <td>${l.tipo === "entrada" ? "Entrada" : "Saída"}</td>
      <td style="text-align:right;">${l.tipo === "entrada" ? "" : "-"}R$ ${formatarMoedaBR(l.valor)}</td>
    </tr>
  `).join("");

  const janela = window.open("", "_blank");
  janela.document.write(`
    <html><head><title>Extrato — ${nomeBanco}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; text-align: left; }
      th { background: #FF6A00; color: #fff; }
      .totais { margin-top: 16px; font-weight: bold; }
    </style></head>
    <body>
      <h2>Extrato Bancário — ${nomeBanco}</h2>
      <p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Classificação</th><th>Tipo</th><th>Valor</th></tr></thead>
        <tbody>${linhasHtml || '<tr><td colspan="5">Nenhum lançamento no período/filtro atual.</td></tr>'}</tbody>
      </table>
      <div class="totais">
        <div>Entradas: R$ ${formatarMoedaBR(totalEntrada)}</div>
        <div>Saídas: R$ ${formatarMoedaBR(totalSaida)}</div>
        <div>Saldo: R$ ${formatarMoedaBR((totalEntrada - totalSaida))}</div>
      </div>
    </body></html>
  `);
  janela.document.close();
  janela.focus();
  janela.print();
}