// ============================================================
// apresentacao.js
// Geração de apresentação .pptx a partir dos dados do sistema.
// Usa pptxgenjs (carregado via CDN no relatorios.html).
// ============================================================

const CORES = {
  laranja:      "FF6A00",
  laranjaEscuro:"B46E0A",
  fundo:        "F5F5F5",
  branco:       "FFFFFF",
  cinzaEscuro:  "333333",
  cinzaMedio:   "666666",
  cinzaClaro:   "CCCCCC",
  verde:        "1C8A4B",
  vermelho:     "DC143C",
  azul:         "2B6CB0",
};

const EMPRESA = "FNX DEV";

// ====================================================
// COLETA DE DADOS
// ====================================================
function coletarDados(mes, ano) {
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia   = new Date(ano, mes + 1, 0);

  const dentroDoMes = (isoStr) => {
    if (!isoStr) return false;
    const d = new Date(isoStr);
    return d >= primeiroDia && d <= ultimoDia;
  };

  // Propostas
  const propostas = (typeof lerPropostas === "function" ? lerPropostas() : []);
  const propostasDoMes = propostas.filter((p) => dentroDoMes(p.criadoEm));

  // Obras
  const obras = JSON.parse(localStorage.getItem("obras_lista")) || [];
  const obrasDoMes = obras.filter((o) => dentroDoMes(o.criadoEm));

  // Financeiro de funcionários
  const financeiro = (financeiroFuncCache.funcionarios || []);

  // Materiais
  const materiais = JSON.parse(localStorage.getItem("materiais_lista")) || [];

  // Boletos
  const boletos = JSON.parse(localStorage.getItem("boletos_lista")) || [];

  // Extrato (todos os bancos)
  const bancos = ["interbanking", "sicredi", "credcrea"];
  let totalEntradas = 0, totalSaidas = 0;
  bancos.forEach((banco) => {
    const lancs = JSON.parse(localStorage.getItem(`extrato_${banco}_lancamentos`)) || [];
    lancs.forEach((l) => {
      if (dentroDoMes(l.data)) {
        if (l.valor > 0) totalEntradas += l.valor;
        else totalSaidas += Math.abs(l.valor);
      }
    });
  });

  // Pontos / banco de horas
  const usuarios = JSON.parse(localStorage.getItem("usuarios")) || [];
  const resumoPontos = usuarios.map((u) => {
    const banco = typeof calcularBancoHoras === "function"
      ? calcularBancoHoras(u.registro)
      : { saldo: 0, horasTrabalhadas: 0 };
    return { nome: u.nome, saldo: banco.saldo, trabalhadas: banco.horasTrabalhadas };
  });

  return {
    mes, ano,
    propostasDoMes,
    obrasDoMes,
    financeiro,
    materiais,
    boletos,
    totalEntradas,
    totalSaidas,
    resumoPontos,
    usuarios,
  };
}

// ====================================================
// HELPERS DE SLIDE
// ====================================================
function addCabecalhoSlide(slide, titulo, subtitulo) {
  // Fundo do cabeçalho
  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: 1.1,
    fill: { color: CORES.laranja },
    line: { type: "none" },
  });

  slide.addText(titulo, {
    x: 0.4, y: 0.15, w: 9.2, h: 0.6,
    fontSize: 24, bold: true, color: CORES.branco,
    fontFace: "Calibri", margin: 0,
  });

  if (subtitulo) {
    slide.addText(subtitulo, {
      x: 0.4, y: 0.72, w: 9.2, h: 0.3,
      fontSize: 12, color: CORES.branco,
      fontFace: "Calibri", margin: 0,
    });
  }
}

function addRodapeSlide(slide, empresa, pagina) {
  slide.addText(`${empresa}  ·  Gerado em ${new Date().toLocaleDateString("pt-BR")}`, {
    x: 0.3, y: 5.2, w: 8.5, h: 0.25,
    fontSize: 8, color: CORES.cinzaMedio,
    fontFace: "Calibri", margin: 0,
  });
  if (pagina) {
    slide.addText(String(pagina), {
      x: 9.3, y: 5.2, w: 0.4, h: 0.25,
      fontSize: 8, color: CORES.cinzaMedio,
      align: "right", fontFace: "Calibri", margin: 0,
    });
  }
}

function formatarMoedaApres(v) {
  return "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function nomeMes(m) {
  return ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][m];
}

// Card de número grande no slide
function addCardNumero(slide, x, y, w, h, rotulo, valor, corFundo, corTexto) {
  slide.addShape("rect", {
    x, y, w, h,
    fill: { color: corFundo || CORES.fundo },
    line: { color: CORES.cinzaClaro, pt: 1 },
    rectRadius: 0.08,
    shadow: { type: "outer", blur: 4, offset: 2, angle: 45, color: "999999", opacity: 0.2 },
  });
  slide.addText(rotulo, {
    x: x + 0.1, y: y + 0.08, w: w - 0.2, h: 0.25,
    fontSize: 9, color: CORES.cinzaMedio, bold: true,
    fontFace: "Calibri", margin: 0, align: "center",
  });
  slide.addText(String(valor), {
    x: x + 0.1, y: y + 0.3, w: w - 0.2, h: h - 0.4,
    fontSize: 18, color: corTexto || CORES.cinzaEscuro, bold: true,
    fontFace: "Calibri", margin: 0, align: "center", valign: "middle",
  });
}

// ====================================================
// SLIDES
// ====================================================
function slideCapa(pres, dados) {
  const slide = pres.addSlide();

  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: "100%",
    fill: { color: CORES.laranja },
    line: { type: "none" },
  });

  slide.addText(EMPRESA, {
    x: 0.5, y: 1.2, w: 9, h: 0.8,
    fontSize: 32, bold: true, color: CORES.branco,
    fontFace: "Calibri", align: "center", margin: 0,
  });

  slide.addText("Relatório de Desempenho", {
    x: 0.5, y: 2.1, w: 9, h: 0.5,
    fontSize: 20, color: CORES.branco,
    fontFace: "Calibri", align: "center", margin: 0,
  });

  slide.addText(`${nomeMes(dados.mes)} / ${dados.ano}`, {
    x: 0.5, y: 2.7, w: 9, h: 0.6,
    fontSize: 28, bold: true, color: CORES.branco,
    fontFace: "Calibri", align: "center", margin: 0,
  });

  slide.addShape("rect", {
    x: 3.5, y: 3.5, w: 3, h: 0.04,
    fill: { color: "FFFFFF", transparency: 60 },
    line: { type: "none" },
  });

  slide.addText(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, {
    x: 0.5, y: 4.8, w: 9, h: 0.3,
    fontSize: 11, color: CORES.branco,
    fontFace: "Calibri", align: "center", margin: 0,
  });
}

function slideResumoFinanceiro(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Resumo Financeiro", `${nomeMes(dados.mes)} / ${dados.ano}`);

  const saldo = dados.totalEntradas - dados.totalSaidas;
  const corSaldo = saldo >= 0 ? CORES.verde : CORES.vermelho;

  addCardNumero(slide, 0.3, 1.3, 2.9, 1.2, "TOTAL ENTRADAS", formatarMoedaApres(dados.totalEntradas), "F0FFF4", CORES.verde);
  addCardNumero(slide, 3.5, 1.3, 2.9, 1.2, "TOTAL SAÍDAS", formatarMoedaApres(dados.totalSaidas), "FFF0F0", CORES.vermelho);
  addCardNumero(slide, 6.7, 1.3, 2.9, 1.2, "SALDO", formatarMoedaApres(saldo), "FFFDF0", corSaldo);

  const totalPagFuncionarios = dados.financeiro.reduce((s, f) => s + (f.valor || 0), 0);
  const totalBoletos = dados.boletos.filter((b) => !b.pago).reduce((s, b) => s + (b.valor || 0), 0);
  const boletosAtrasados = dados.boletos.filter((b) => {
    if (b.pago || !b.dataVencimento) return false;
    return new Date(b.dataVencimento + "T00:00:00") < new Date();
  }).length;

  addCardNumero(slide, 0.3, 2.7, 2.9, 1.2, "PAGAMENTOS SERVIÇOS", formatarMoedaApres(totalPagFuncionarios), CORES.fundo, CORES.cinzaEscuro);
  addCardNumero(slide, 3.5, 2.7, 2.9, 1.2, "BOLETOS A PAGAR", formatarMoedaApres(totalBoletos), CORES.fundo, CORES.cinzaEscuro);
  addCardNumero(slide, 6.7, 2.7, 2.9, 1.2, "BOLETOS ATRASADOS", String(boletosAtrasados), boletosAtrasados > 0 ? "FFF0F0" : CORES.fundo, boletosAtrasados > 0 ? CORES.vermelho : CORES.verde);

  addRodapeSlide(slide, EMPRESA, pag);
}

function slideObras(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Projetos do Período", `${nomeMes(dados.mes)} / ${dados.ano}`);

  if (dados.obrasDoMes.length === 0) {
    slide.addText("Nenhum projeto no período selecionado.", {
      x: 0.4, y: 2, w: 9.2, h: 1,
      fontSize: 16, color: CORES.cinzaMedio, align: "center",
      fontFace: "Calibri",
    });
    addRodapeSlide(slide, EMPRESA, pag);
    return;
  }

  const totalLucro = dados.obrasDoMes.reduce((s, o) => {
    const pago = (o.funcionarios || []).reduce((a, f) => a + (f.valorPago || 0), 0);
    const mat  = (o.materiais   || []).reduce((a, m) => a + (m.valor || 0), 0);
    return s + ((o.valorMaoDeObraOrcamento || 0) + (o.valorMateriaisOrcamento || 0) - pago - mat);
  }, 0);

  addCardNumero(slide, 0.3, 1.3, 2.9, 0.9, "PROJETOS NO PERÍODO", String(dados.obrasDoMes.length), CORES.fundo, CORES.cinzaEscuro);
  addCardNumero(slide, 3.5, 1.3, 2.9, 0.9, "LUCRO TOTAL", formatarMoedaApres(totalLucro), totalLucro >= 0 ? "F0FFF4" : "FFF0F0", totalLucro >= 0 ? CORES.verde : CORES.vermelho);

  const linhas = dados.obrasDoMes.slice(0, 8).map((o) => {
    const pago = (o.funcionarios || []).reduce((a, f) => a + (f.valorPago || 0), 0);
    const mat  = (o.materiais   || []).reduce((a, m) => a + (m.valor || 0), 0);
    const lucro = ((o.valorMaoDeObraOrcamento || 0) + (o.valorMateriaisOrcamento || 0)) - pago - mat;
    return [
      { text: o.cliente || "—", options: { fontSize: 9, bold: false } },
      { text: o.servico || "—", options: { fontSize: 9 } },
      { text: formatarMoedaApres(lucro), options: { fontSize: 9, bold: true, color: lucro >= 0 ? CORES.verde : CORES.vermelho } },
    ];
  });

  slide.addTable(
    [
      [
        { text: "Cliente", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
        { text: "Serviço", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
        { text: "Lucro", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
      ],
      ...linhas,
    ],
    { x: 0.3, y: 2.35, w: 9.4, rowH: 0.3, border: { color: CORES.cinzaClaro, pt: 1 }, autoPage: false }
  );

  addRodapeSlide(slide, EMPRESA, pag);
}

function slidePropostas(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Propostas e Estimativas", `${nomeMes(dados.mes)} / ${dados.ano}`);

  const total     = dados.propostasDoMes.length;
  const aprovadas = dados.propostasDoMes.filter((p) => p.status === "andamento" || p.status === "finalizada").length;
  const negadas   = dados.propostasDoMes.filter((p) => p.status === "negada").length;
  const emAnalise = dados.propostasDoMes.filter((p) => p.status === "analise").length;
  const orcamento = dados.propostasDoMes.filter((p) => p.status === "orcamento").length;

  addCardNumero(slide, 0.3,  1.3, 1.8, 1.1, "TOTAL",      String(total),     CORES.fundo,  CORES.cinzaEscuro);
  addCardNumero(slide, 2.4,  1.3, 1.8, 1.1, "APROVADAS",  String(aprovadas), "F0FFF4",     CORES.verde);
  addCardNumero(slide, 4.5,  1.3, 1.8, 1.1, "EM APROVAÇÃO", String(emAnalise), "FFFDF0",     CORES.laranjaEscuro);
  addCardNumero(slide, 6.6,  1.3, 1.8, 1.1, "NEGADAS",    String(negadas),   negadas > 0 ? "FFF0F0" : CORES.fundo, negadas > 0 ? CORES.vermelho : CORES.cinzaEscuro);
  addCardNumero(slide, 8.7,  1.3, 1.0, 1.1, "ESTIMATIVA",  String(orcamento), CORES.fundo,  CORES.cinzaEscuro);

  if (dados.propostasDoMes.length > 0) {
    const linhas = dados.propostasDoMes.slice(0, 7).map((p) => {
      const statusLabel = { orcamento: "Estimativa", analise: "Em Aprovação", andamento: "Em Desenvolvimento", finalizada: "Finalizada", negada: "Negada" }[p.status] || p.status;
      const totalProp = ((p.itensMaoDeObra || []).reduce((s, i) => s + i.qtd * i.valorUnit, 0)) +
                        ((p.itensMateriais || []).reduce((s, i) => s + i.qtd * i.valorUnit, 0));
      return [
        { text: p.cliente || "—", options: { fontSize: 9 } },
        { text: p.servico ? p.servico.slice(0, 40) : "—", options: { fontSize: 9 } },
        { text: formatarMoedaApres(totalProp), options: { fontSize: 9, bold: true } },
        { text: statusLabel, options: { fontSize: 9 } },
      ];
    });

    slide.addTable(
      [
        [
          { text: "Cliente", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
          { text: "Serviço", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
          { text: "Valor", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
          { text: "Status", options: { bold: true, color: CORES.branco, fill: { color: CORES.laranjaEscuro }, fontSize: 10 } },
        ],
        ...linhas,
      ],
      { x: 0.3, y: 2.6, w: 9.4, rowH: 0.3, border: { color: CORES.cinzaClaro, pt: 1 }, autoPage: false }
    );
  }

  addRodapeSlide(slide, EMPRESA, pag);
}

function slideMateriais(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Catálogo de Produtos", "Estoque atual");

  const totalItens  = dados.materiais.length;
  const valorTotal  = dados.materiais.reduce((s, m) => s + (m.valor || 0) * (m.quantidade || 0), 0);
  const setores     = [...new Set(dados.materiais.map((m) => m.setor).filter(Boolean))];

  addCardNumero(slide, 0.3, 1.3, 2.9, 1.0, "ITENS EM ESTOQUE", String(totalItens), CORES.fundo, CORES.cinzaEscuro);
  addCardNumero(slide, 3.5, 1.3, 2.9, 1.0, "VALOR TOTAL", formatarMoedaApres(valorTotal), CORES.fundo, CORES.azul);
  addCardNumero(slide, 6.7, 1.3, 2.9, 1.0, "SETORES", String(setores.length), CORES.fundo, CORES.cinzaEscuro);

  if (dados.materiais.length > 0) {
    const linhas = dados.materiais.slice(0, 8).map((m) => [
      { text: m.nome || "—", options: { fontSize: 9 } },
      { text: m.setor || "—", options: { fontSize: 9 } },
      { text: String(m.quantidade || 0), options: { fontSize: 9, align: "center" } },
      { text: formatarMoedaApres(m.valor || 0), options: { fontSize: 9 } },
      { text: formatarMoedaApres((m.valor || 0) * (m.quantidade || 0)), options: { fontSize: 9, bold: true } },
    ]);

    slide.addTable(
      [
        [
          { text: "Produto", options: { bold: true, color: CORES.branco, fill: { color: CORES.azul }, fontSize: 10 } },
          { text: "Setor", options: { bold: true, color: CORES.branco, fill: { color: CORES.azul }, fontSize: 10 } },
          { text: "Qtd", options: { bold: true, color: CORES.branco, fill: { color: CORES.azul }, fontSize: 10 } },
          { text: "Valor Unit.", options: { bold: true, color: CORES.branco, fill: { color: CORES.azul }, fontSize: 10 } },
          { text: "Total", options: { bold: true, color: CORES.branco, fill: { color: CORES.azul }, fontSize: 10 } },
        ],
        ...linhas,
      ],
      { x: 0.3, y: 2.5, w: 9.4, rowH: 0.3, border: { color: CORES.cinzaClaro, pt: 1 }, autoPage: false }
    );
  }

  addRodapeSlide(slide, EMPRESA, pag);
}

function slideFuncionarios(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Funcionários e Pagamentos", `${nomeMes(dados.mes)} / ${dados.ano}`);

  const totalPago = dados.financeiro.reduce((s, f) => s + (f.valor || 0), 0);
  const qtdFunc   = dados.usuarios.length;

  addCardNumero(slide, 0.3, 1.3, 2.9, 1.0, "FUNCIONÁRIOS", String(qtdFunc), CORES.fundo, CORES.cinzaEscuro);
  addCardNumero(slide, 3.5, 1.3, 2.9, 1.0, "TOTAL PAGO", formatarMoedaApres(totalPago), CORES.fundo, CORES.cinzaEscuro);

  if (dados.financeiro.length > 0) {
    const linhas = dados.financeiro.slice(0, 8).map((f) => [
      { text: f.nome || "—", options: { fontSize: 9 } },
      { text: f.obra || "—", options: { fontSize: 9 } },
      { text: f.mes || "—", options: { fontSize: 9 } },
      { text: formatarMoedaApres(f.valor), options: { fontSize: 9, bold: true } },
    ]);

    slide.addTable(
      [
        [
          { text: "Funcionário", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
          { text: "Projeto", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
          { text: "Mês", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
          { text: "Valor Pago", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
        ],
        ...linhas,
      ],
      { x: 0.3, y: 2.5, w: 9.4, rowH: 0.3, border: { color: CORES.cinzaClaro, pt: 1 }, autoPage: false }
    );
  }

  addRodapeSlide(slide, EMPRESA, pag);
}

function slidePontos(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Banco de Horas", "Saldo acumulado por funcionário");

  if (dados.resumoPontos.length === 0) {
    slide.addText("Nenhum registro de ponto encontrado.", {
      x: 0.4, y: 2.5, w: 9.2, h: 0.6,
      fontSize: 14, color: CORES.cinzaMedio, align: "center", fontFace: "Calibri",
    });
    addRodapeSlide(slide, EMPRESA, pag);
    return;
  }

  const comSaldo = dados.resumoPontos.filter((r) => r.trabalhadas > 0);
  const linhas = comSaldo.slice(0, 9).map((r) => {
    const sinal = r.saldo >= 0 ? "+" : "";
    const cor   = r.saldo >= 0 ? CORES.verde : CORES.vermelho;
    const h = Math.floor(Math.abs(r.trabalhadas));
    const m = Math.round((Math.abs(r.trabalhadas) % 1) * 60);
    const trabStr = `${String(h).padStart(2,"0")}h${String(m).padStart(2,"0")}m`;
    const sh = Math.floor(Math.abs(r.saldo));
    const sm = Math.round((Math.abs(r.saldo) % 1) * 60);
    const saldoStr = `${sinal}${String(sh).padStart(2,"0")}h${String(sm).padStart(2,"0")}m`;
    return [
      { text: r.nome, options: { fontSize: 9 } },
      { text: trabStr, options: { fontSize: 9, align: "center" } },
      { text: saldoStr, options: { fontSize: 9, bold: true, color: cor, align: "center" } },
    ];
  });

  slide.addTable(
    [
      [
        { text: "Funcionário", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
        { text: "Horas Trabalhadas", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
        { text: "Saldo Banco", options: { bold: true, color: CORES.branco, fill: { color: CORES.cinzaEscuro }, fontSize: 10 } },
      ],
      ...linhas,
    ],
    { x: 0.3, y: 1.4, w: 9.4, rowH: 0.4, border: { color: CORES.cinzaClaro, pt: 1 }, autoPage: false }
  );

  addRodapeSlide(slide, EMPRESA, pag);
}

function slideBoletos(pres, dados, pag) {
  const slide = pres.addSlide();
  addCabecalhoSlide(slide, "Boletos", "Situação geral");

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const pendentes   = dados.boletos.filter((b) => !b.pago && b.dataVencimento && new Date(b.dataVencimento + "T00:00:00") >= hoje);
  const atrasados   = dados.boletos.filter((b) => !b.pago && b.dataVencimento && new Date(b.dataVencimento + "T00:00:00") < hoje);
  const pagos       = dados.boletos.filter((b) => b.pago);

  const totalPendentes = pendentes.reduce((s, b) => s + (b.valor || 0), 0);
  const totalAtrasados = atrasados.reduce((s, b) => s + (b.valor || 0), 0);
  const totalPagos     = pagos.reduce((s, b) => s + (b.valor || 0), 0);

  addCardNumero(slide, 0.3, 1.3, 2.9, 1.1, "PENDENTES", `${pendentes.length}\n${formatarMoedaApres(totalPendentes)}`, "EFF8FF", CORES.azul);
  addCardNumero(slide, 3.5, 1.3, 2.9, 1.1, "ATRASADOS", `${atrasados.length}\n${formatarMoedaApres(totalAtrasados)}`, atrasados.length > 0 ? "FFF0F0" : CORES.fundo, atrasados.length > 0 ? CORES.vermelho : CORES.cinzaEscuro);
  addCardNumero(slide, 6.7, 1.3, 2.9, 1.1, "PAGOS", `${pagos.length}\n${formatarMoedaApres(totalPagos)}`, "F0FFF4", CORES.verde);

  if (atrasados.length > 0) {
    slide.addText("Boletos em Atraso", {
      x: 0.3, y: 2.55, w: 4, h: 0.3,
      fontSize: 12, bold: true, color: CORES.vermelho, fontFace: "Calibri", margin: 0,
    });

    const linhasAtras = atrasados.slice(0, 5).map((b) => [
      { text: b.nome || "—", options: { fontSize: 9 } },
      { text: b.dataVencimento ? new Date(b.dataVencimento+"T00:00:00").toLocaleDateString("pt-BR") : "—", options: { fontSize: 9 } },
      { text: formatarMoedaApres(b.valor), options: { fontSize: 9, bold: true, color: CORES.vermelho } },
    ]);

    slide.addTable(
      [
        [
          { text: "Cliente/Fornecedor", options: { bold: true, color: CORES.branco, fill: { color: CORES.vermelho }, fontSize: 10 } },
          { text: "Vencimento", options: { bold: true, color: CORES.branco, fill: { color: CORES.vermelho }, fontSize: 10 } },
          { text: "Valor", options: { bold: true, color: CORES.branco, fill: { color: CORES.vermelho }, fontSize: 10 } },
        ],
        ...linhasAtras,
      ],
      { x: 0.3, y: 2.9, w: 9.4, rowH: 0.32, border: { color: CORES.cinzaClaro, pt: 1 }, autoPage: false }
    );
  }

  addRodapeSlide(slide, EMPRESA, pag);
}

function slideEncerramento(pres) {
  const slide = pres.addSlide();

  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: "100%",
    fill: { color: CORES.cinzaEscuro },
    line: { type: "none" },
  });

  slide.addText(EMPRESA, {
    x: 0.5, y: 1.8, w: 9, h: 0.6,
    fontSize: 22, bold: true, color: CORES.laranja,
    fontFace: "Calibri", align: "center", margin: 0,
  });

  slide.addText("Obrigado", {
    x: 0.5, y: 2.5, w: 9, h: 1,
    fontSize: 40, bold: true, color: CORES.branco,
    fontFace: "Calibri", align: "center", margin: 0,
  });

  slide.addText(`Relatório gerado em ${new Date().toLocaleDateString("pt-BR")}`, {
    x: 0.5, y: 3.8, w: 9, h: 0.3,
    fontSize: 11, color: "AAAAAA",
    fontFace: "Calibri", align: "center", margin: 0,
  });
}

// ====================================================
// FUNÇÃO PRINCIPAL
// ====================================================
async function gerarApresentacao(mes, ano, slidesSelecionados) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "FNX DEV";
  pres.title  = `Relatório ${nomeMes(mes)} ${ano}`;

  const dados = coletarDados(mes, ano);
  let pag = 1;

  if (slidesSelecionados.includes("capa")) {
    slideCapa(pres, dados);
    pag++;
  }
  if (slidesSelecionados.includes("resumo_financeiro")) {
    slideResumoFinanceiro(pres, dados, pag++);
  }
  if (slidesSelecionados.includes("obras")) {
    slideObras(pres, dados, pag++);
  }
  if (slidesSelecionados.includes("propostas")) {
    slidePropostas(pres, dados, pag++);
  }
  if (slidesSelecionados.includes("materiais")) {
    slideMateriais(pres, dados, pag++);
  }
  if (slidesSelecionados.includes("funcionarios")) {
    slideFuncionarios(pres, dados, pag++);
  }
  if (slidesSelecionados.includes("pontos")) {
    slidePontos(pres, dados, pag++);
  }
  if (slidesSelecionados.includes("boletos")) {
    slideBoletos(pres, dados, pag++);
  }

  slideEncerramento(pres);

  const nomeArq = `apresentacao_fnxdev_${nomeMes(mes).toLowerCase()}_${ano}.pptx`;
  await pres.writeFile({ fileName: nomeArq });
}
