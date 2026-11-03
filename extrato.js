// ============================================================
// extrato.js
// Motor genérico de extrato bancário (entradas/saídas), usado
// pela tela de Gerenciamento de Contas (uma conta por vez). Agora no
// banco central (KV), não mais localStorage — cada lançamento
// guarda "banco" pra saber de qual conta é, e pode ficar vinculado
// a um Boleto (nos dois sentidos: lançamento → boleto e boleto →
// lançamento).
//
// Cada página define window.EXTRATO_CONFIG antes de carregar este
// script, com o nome do banco — é só isso que diferencia as três.
// ============================================================

(async function () {
  const config = window.EXTRATO_CONFIG;
  if (!config) {
    console.error("extrato.js: defina window.EXTRATO_CONFIG antes de carregar este script.");
    return;
  }
  const BANCO_ATUAL = config.nomeBanco;

  // ====================================================
  // ELEMENTOS
  // ====================================================
  const modalClassificacao = document.getElementById("modalClassificacao");
  const btnAbrirClassificacao = document.getElementById("btnAbrirClassificacao");
  const fecharModalClassificacao = document.getElementById("fecharModalClassificacao");
  const formClassificacao = document.getElementById("form-classificacao");
  const novaClassificacaoInput = document.getElementById("novaClassificacaoInput");
  const listaClassificacoes = document.getElementById("listaClassificacoes");

  const modalLancamento = document.getElementById("modalLancamento");
  const btnAbrirLancamento = document.getElementById("btnAbrirLancamento");
  const fecharModalLancamento = document.getElementById("fecharModalLancamento");
  const tituloModalLancamento = document.getElementById("tituloModalLancamento");
  const form = document.getElementById("form-lancamento");
  const btnTipoEntrada = document.getElementById("btnTipoEntrada");
  const btnTipoSaida = document.getElementById("btnTipoSaida");
  const inputTipo = document.getElementById("tipoLancamento");
  const selectClassificacao = document.getElementById("classificacao");
  const selectVinculoBoleto = document.getElementById("vinculoBoletoLancamento");
  const btnSubmitLancamento = document.getElementById("btnSubmitLancamento");

  const buscaInput = document.getElementById("buscaTexto");
  const filtroTipo = document.getElementById("filtroTipo");

  const multiClassificacao = document.getElementById("multiClassificacao");
  const toggleClassificacao = document.getElementById("toggleClassificacao");
  const painelClassificacao = document.getElementById("painelClassificacao");
  const resumoClassificacao = document.getElementById("resumoClassificacao");

  const btnLimparFiltros = document.getElementById("btnLimparFiltros");

  const tabelaBody = document.querySelector("#tabelaLancamentos tbody");
  const semResultados = document.getElementById("semResultados");

  const resumoEntradaValor = document.getElementById("resumoEntradaValor");
  const resumoSaidaValor = document.getElementById("resumoSaidaValor");
  const resumoSaldoValor = document.getElementById("resumoSaldoValor");

  const totalEntradaValor = document.getElementById("totalEntradaValor");
  const totalSaidaValor = document.getElementById("totalSaidaValor");
  const totalSaldoValor = document.getElementById("totalSaldoValor");

  // ====================================================
  // ESTADO
  // ====================================================
  let extratoConfigGeral = {}; // { Sicredi: {classificacoes:[], dadosConta:{}}, Inter: {...}, ... }
  let todosOsLancamentos = []; // TODOS os bancos — filtra por BANCO_ATUAL na hora de exibir
  let boletosCache = [];
  let idEditando = null;
  let tipoSelecionadoModal = "entrada";
  let classificacoesSelecionadas = new Set(); // vazio = todas

  function classificacoes() {
    return (extratoConfigGeral[BANCO_ATUAL] && extratoConfigGeral[BANCO_ATUAL].classificacoes) || [];
  }
  function lancamentosDoBanco() {
    return todosOsLancamentos.filter((l) => l.banco === BANCO_ATUAL);
  }
  async function salvarExtratoConfigGeral() {
    await apiDataSet("extratoConfig", extratoConfigGeral);
  }

  async function carregarTudo() {
    const [respConfig, respLancamentos, respBoletos] = await Promise.all([
      apiDataGet("extratoConfig"),
      apiListarLancamentosExtrato(),
      apiListarBoletos(),
    ]);
    extratoConfigGeral = (respConfig.ok && respConfig.valor) ? respConfig.valor : {};
    if (!extratoConfigGeral[BANCO_ATUAL]) extratoConfigGeral[BANCO_ATUAL] = { classificacoes: [], dadosConta: {} };
    todosOsLancamentos = respLancamentos.ok ? respLancamentos.lancamentos : [];
    boletosCache = respBoletos.ok ? respBoletos.boletos : [];
  }

  // ====================================================
  // MODAIS — abrir / fechar
  // ====================================================
  function abrirModal(modal) {
    modal.classList.add("active");
  }
  function fecharModalEl(modal) {
    modal.classList.remove("active");
  }

  btnAbrirClassificacao.addEventListener("click", () => abrirModal(modalClassificacao));
  fecharModalClassificacao.addEventListener("click", () => fecharModalEl(modalClassificacao));
  modalClassificacao.addEventListener("click", (e) => {
    if (e.target === modalClassificacao) fecharModalEl(modalClassificacao);
  });

  btnAbrirLancamento.addEventListener("click", () => {
    if (idEditando === null) {
      form.reset();
      definirTipoModal("entrada");
      tituloModalLancamento.textContent = "Novo lançamento";
      btnSubmitLancamento.textContent = "Adicionar";
    }
    renderSelectVinculoBoleto();
    abrirModal(modalLancamento);
  });
  fecharModalLancamento.addEventListener("click", () => fecharModalEl(modalLancamento));
  modalLancamento.addEventListener("click", (e) => {
    if (e.target === modalLancamento) fecharModalEl(modalLancamento);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    fecharModalEl(modalClassificacao);
    fecharModalEl(modalLancamento);
  });

  // ====================================================
  // TOGGLE ENTRADA / SAÍDA NO MODAL
  // ====================================================
  function definirTipoModal(tipo) {
    tipoSelecionadoModal = tipo;
    inputTipo.value = tipo;
    btnTipoEntrada.classList.toggle("active", tipo === "entrada");
    btnTipoSaida.classList.toggle("active", tipo === "saida");
  }
  btnTipoEntrada.addEventListener("click", () => definirTipoModal("entrada"));
  btnTipoSaida.addEventListener("click", () => definirTipoModal("saida"));

  // Ao escolher um boleto pra vincular, puxa os dados dele pros
  // campos do lançamento — evita digitar de novo o que já está
  // cadastrado no boleto.
  selectVinculoBoleto.addEventListener("change", () => {
    const boletoId = selectVinculoBoleto.value;
    if (!boletoId) return;
    const boleto = boletosCache.find((b) => b.id === boletoId);
    if (!boleto) return;

    if (boleto.valor !== null && boleto.valor !== undefined) {
      document.getElementById("valor").value = boleto.valor;
    }
    if (boleto.nome) {
      document.getElementById("descricao").value = boleto.nome;
    }
    if (boleto.dataVencimento) {
      document.getElementById("dataLancamento").value = boleto.dataVencimento;
    }
    // Despesa no Boleto normalmente vira Saída no Extrato (dinheiro
    // saindo pra pagar); Entrada vira Entrada.
    definirTipoModal(boleto.tipo === "despesa" ? "saida" : "entrada");
  });

  // ====================================================
  // VÍNCULO COM BOLETO
  // ====================================================
  function renderSelectVinculoBoleto() {
    const valorAtual = selectVinculoBoleto.value;
    // Só mostra boletos que ainda não têm outro lançamento vinculado
    // (ou o que já está vinculado neste lançamento sendo editado).
    const disponiveis = boletosCache.filter((b) => !b.vinculoExtratoId || (idEditando && b.vinculoExtratoId === idEditando));
    selectVinculoBoleto.innerHTML = '<option value="">Nenhum</option>' +
      disponiveis.map((b) => `<option value="${b.id}">${escaparHtml(b.nome) || "(sem nome)"} — ${b.valor !== null ? "R$ " + b.valor.toFixed(2) : "sem valor"}</option>`).join("");
    selectVinculoBoleto.value = valorAtual;
  }

  // ====================================================
  // CLASSIFICAÇÕES (cadastro fixo, por banco)
  // ====================================================
  function renderClassificacoes() {
    const valorSelecionado = selectClassificacao.value;
    selectClassificacao.innerHTML = '<option value="" disabled selected>Selecione</option>';
    classificacoes().forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectClassificacao.appendChild(opt);
    });
    if (classificacoes().includes(valorSelecionado)) {
      selectClassificacao.value = valorSelecionado;
    }

    listaClassificacoes.innerHTML = "";
    if (classificacoes().length === 0) {
      listaClassificacoes.innerHTML = '<p class="sem-obras">Nenhuma classificação cadastrada ainda.</p>';
      return;
    }
    classificacoes().forEach((c, index) => {
      const chip = document.createElement("div");
      chip.className = "chip-obra";
      chip.innerHTML = `<span>${escaparHtml(c)}</span>`;
      const btnRemover = document.createElement("button");
      btnRemover.textContent = "×";
      btnRemover.title = "Excluir classificação";
      btnRemover.addEventListener("click", () => excluirClassificacao(index));
      chip.appendChild(btnRemover);
      listaClassificacoes.appendChild(chip);
    });
  }

  async function excluirClassificacao(index) {
    const nome = classificacoes()[index];
    const usada = lancamentosDoBanco().some((l) => l.classificacao === nome);
    if (usada) {
      const confirmado = await confirmarAcao(
        `Excluir a classificação "${nome}"?`,
        "Os lançamentos já registrados não serão apagados, mas essa classificação não vai mais aparecer na lista para novos lançamentos."
      );
      if (!confirmado) return;
    }
    extratoConfigGeral[BANCO_ATUAL].classificacoes.splice(index, 1);
    await salvarExtratoConfigGeral();
    renderClassificacoes();
  }

  formClassificacao.addEventListener("submit", async (e) => {
    e.preventDefault();
    limparErroCampo(novaClassificacaoInput);
    const nome = novaClassificacaoInput.value.trim();
    if (!nome) return;
    if (classificacoes().includes(nome)) {
      marcarCampoComErro(novaClassificacaoInput, "Essa classificação já está cadastrada.");
      return;
    }
    extratoConfigGeral[BANCO_ATUAL].classificacoes.push(nome);
    await salvarExtratoConfigGeral();
    renderClassificacoes();
    novaClassificacaoInput.value = "";
  });
  limparErroAoEditar(novaClassificacaoInput);

  // ====================================================
  // LANÇAMENTOS (cadastro / edição)
  // ====================================================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const campoData = document.getElementById("dataLancamento");
    const campoDescricao = document.getElementById("descricao");
    const campoValor = document.getElementById("valor");

    limparErrosDoFormulario(form);

    const data = campoData.value;
    const descricao = campoDescricao.value.trim();
    const valor = parseFloat(campoValor.value);
    const classificacao = selectClassificacao.value;
    const observacao = document.getElementById("observacao").value.trim();
    const novoVinculoBoletoId = selectVinculoBoleto.value || null;

    let temErro = false;
    if (!data) { marcarCampoComErro(campoData, "Informe a data."); temErro = true; }
    if (!descricao) { marcarCampoComErro(campoDescricao, "Informe a descrição."); temErro = true; }
    if (isNaN(valor)) { marcarCampoComErro(campoValor, "Informe um valor válido."); temErro = true; }
    if (!classificacao) { marcarCampoComErro(selectClassificacao, "Selecione uma classificação."); temErro = true; }
    if (temErro) { focarPrimeiroErro(form); return; }

    btnSubmitLancamento.disabled = true;
    try {
      const registro = {
        id: idEditando,
        banco: BANCO_ATUAL, data, descricao, valor: Math.abs(valor),
        tipo: tipoSelecionadoModal, classificacao, observacao,
        vinculoBoletoId: novoVinculoBoletoId,
      };

      const vinculoAntigoId = idEditando ? (todosOsLancamentos.find((l) => l.id === idEditando) || {}).vinculoBoletoId : null;

      const resp = await apiSalvarLancamentoExtrato(registro);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao salvar.", "erro"); return; }

      const idx = todosOsLancamentos.findIndex((l) => l.id === resp.id);
      if (idx !== -1) todosOsLancamentos[idx] = resp.lancamento;
      else todosOsLancamentos.push(resp.lancamento);

      // Sincroniza o outro lado do vínculo (boleto → lançamento).
      if (vinculoAntigoId && vinculoAntigoId !== novoVinculoBoletoId) {
        const boletoAntigo = boletosCache.find((b) => b.id === vinculoAntigoId);
        if (boletoAntigo) { boletoAntigo.vinculoExtratoId = null; await apiSalvarBoleto(boletoAntigo); }
      }
      if (novoVinculoBoletoId) {
        const boletoNovo = boletosCache.find((b) => b.id === novoVinculoBoletoId);
        if (boletoNovo) { boletoNovo.vinculoExtratoId = resp.id; await apiSalvarBoleto(boletoNovo); }
      }

      idEditando = null;
      btnSubmitLancamento.textContent = "Adicionar";
      tituloModalLancamento.textContent = "Novo lançamento";

      form.reset();
      fecharModalEl(modalLancamento);
      renderTudo();
      mostrarToast("Lançamento salvo.");
    } finally {
      btnSubmitLancamento.disabled = false;
    }
  });

  function editar(id) {
    const l = todosOsLancamentos.find((x) => x.id === id);
    if (!l) return;
    document.getElementById("dataLancamento").value = l.data;
    document.getElementById("descricao").value = l.descricao;
    document.getElementById("valor").value = l.valor;
    selectClassificacao.value = l.classificacao;
    document.getElementById("observacao").value = l.observacao || "";
    definirTipoModal(l.tipo);
    idEditando = id;
    tituloModalLancamento.textContent = "Editar lançamento";
    btnSubmitLancamento.textContent = "Salvar alterações";
    renderSelectVinculoBoleto();
    selectVinculoBoleto.value = l.vinculoBoletoId || "";
    abrirModal(modalLancamento);
  }

  async function excluir(id) {
    const confirmado = await confirmarAcao("Excluir lançamento?", "Essa ação não pode ser desfeita.");
    if (!confirmado) return;

    const lancamento = todosOsLancamentos.find((l) => l.id === id);
    const resp = await apiExcluirLancamentoExtrato(id);
    if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }

    // Solta o boleto vinculado, se tinha algum
    if (lancamento && lancamento.vinculoBoletoId) {
      const boleto = boletosCache.find((b) => b.id === lancamento.vinculoBoletoId);
      if (boleto) { boleto.vinculoExtratoId = null; await apiSalvarBoleto(boleto); }
    }

    todosOsLancamentos = todosOsLancamentos.filter((l) => l.id !== id);
    if (idEditando === id) {
      idEditando = null;
      form.reset();
      btnSubmitLancamento.textContent = "Adicionar";
      tituloModalLancamento.textContent = "Novo lançamento";
    }
    renderTudo();
  }

  // ====================================================
  // MULTI-SELECT (Classificação no filtro)
  // ====================================================
  function configurarMultiSelect({ painel, toggle, container, resumoEl, getOpcoes, selecionados, labelTodos, onChange }) {
    function renderPainel() {
      const opcoes = getOpcoes();
      painel.innerHTML = "";
      if (opcoes.length === 0) {
        painel.innerHTML = '<div class="multi-select-vazio">Nenhuma opção disponível ainda.</div>';
        return;
      }
      opcoes.forEach((opcao) => {
        const linha = document.createElement("label");
        linha.className = "multi-select-opcao";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selecionados.has(opcao);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selecionados.add(opcao);
          else selecionados.delete(opcao);
          atualizarResumo();
          onChange();
        });
        linha.appendChild(checkbox);
        linha.appendChild(document.createTextNode(opcao));
        painel.appendChild(linha);
      });

      const acoes = document.createElement("div");
      acoes.className = "multi-select-acoes";
      const btnTodos = document.createElement("button");
      btnTodos.type = "button";
      btnTodos.textContent = "Selecionar todas";
      btnTodos.addEventListener("click", () => {
        opcoes.forEach((o) => selecionados.add(o));
        renderPainel();
        atualizarResumo();
        onChange();
      });
      const btnLimpar = document.createElement("button");
      btnLimpar.type = "button";
      btnLimpar.textContent = "Limpar";
      btnLimpar.addEventListener("click", () => {
        selecionados.clear();
        renderPainel();
        atualizarResumo();
        onChange();
      });
      acoes.appendChild(btnTodos);
      acoes.appendChild(btnLimpar);
      painel.appendChild(acoes);
    }

    function atualizarResumo() {
      if (selecionados.size === 0) resumoEl.textContent = labelTodos;
      else if (selecionados.size === 1) resumoEl.textContent = [...selecionados][0];
      else resumoEl.textContent = `${selecionados.size} selecionadas`;
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const estavaAberto = container.classList.contains("open");
      document.querySelectorAll(".multi-select.open").forEach((el) => el.classList.remove("open"));
      if (!estavaAberto) { renderPainel(); container.classList.add("open"); }
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) container.classList.remove("open");
    });

    atualizarResumo();
  }

  configurarMultiSelect({
    painel: painelClassificacao, toggle: toggleClassificacao, container: multiClassificacao,
    resumoEl: resumoClassificacao, getOpcoes: () => classificacoes(),
    selecionados: classificacoesSelecionadas, labelTodos: "Todas",
    onChange: () => renderTabela(),
  });

  // ====================================================
  // FILTRAGEM
  // ====================================================
  function aplicarFiltros() {
    const termo = buscaInput.value.trim().toLowerCase();
    const tipoSel = filtroTipo.value;

    return lancamentosDoBanco()
      .filter((l) => {
        const buscaOK = termo === "" || l.descricao.toLowerCase().includes(termo) || (l.observacao || "").toLowerCase().includes(termo);
        const tipoOK = tipoSel === "todos" || l.tipo === tipoSel;
        const classificacaoOK = classificacoesSelecionadas.size === 0 || classificacoesSelecionadas.has(l.classificacao);
        return buscaOK && tipoOK && classificacaoOK;
      })
      .sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  function formatarMoeda(valor) {
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatarData(isoDate) {
    if (!isoDate) return "";
    const [ano, mes, dia] = isoDate.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  // ====================================================
  // RENDERIZAÇÃO
  // ====================================================
  function renderTabela() {
    const itens = aplicarFiltros();
    tabelaBody.innerHTML = "";

    let totalEntradas = 0;
    let totalSaidas = 0;

    itens.forEach((l) => {
      if (l.tipo === "entrada") totalEntradas += l.valor;
      else totalSaidas += l.valor;

      const tr = document.createElement("tr");
      const valorClasse = l.tipo === "entrada" ? "valor-entrada" : "valor-saida";
      const valorSinal = l.tipo === "entrada" ? "+" : "−";
      const boletoVinculado = l.vinculoBoletoId ? boletosCache.find((b) => b.id === l.vinculoBoletoId) : null;

      tr.innerHTML = `
        <td data-label="Data">${formatarData(l.data)}</td>
        <td data-label="Descrição">${escaparHtml(l.descricao)}${boletoVinculado ? ` <span class="tag-classificacao" title="Vinculado a um boleto">🔗 ${escaparHtml(boletoVinculado.nome) || "boleto"}</span>` : ""}</td>
        <td data-label="Classificação"><span class="tag-classificacao">${escaparHtml(l.classificacao)}</span></td>
        <td data-label="Observação" class="coluna-observacao">${escaparHtml(l.observacao) || "—"}</td>
        <td data-label="Valor" class="${valorClasse}">${valorSinal} R$ ${formatarMoeda(l.valor)}</td>
        <td data-label="Ações">
          <button class="btn-editar" data-edit-id="${l.id}">Editar</button>
          <button class="btn-excluir-item" data-delete-id="${l.id}">Excluir</button>
        </td>
      `;
      tabelaBody.appendChild(tr);
    });

    semResultados.style.display = itens.length === 0 ? "block" : "none";
    document.getElementById("tabelaLancamentos").style.display = itens.length === 0 ? "none" : "table";

    tabelaBody.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", () => editar(btn.dataset.editId));
    });
    tabelaBody.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => excluir(btn.dataset.deleteId));
    });

    const saldo = totalEntradas - totalSaidas;
    totalEntradaValor.textContent = `R$ ${formatarMoeda(totalEntradas)}`;
    totalSaidaValor.textContent = `R$ ${formatarMoeda(totalSaidas)}`;
    totalSaldoValor.textContent = `R$ ${formatarMoeda(saldo)}`;
  }

  function renderResumoGeral() {
    let totalEntradas = 0;
    let totalSaidas = 0;
    lancamentosDoBanco().forEach((l) => {
      if (l.tipo === "entrada") totalEntradas += l.valor;
      else totalSaidas += l.valor;
    });
    const saldo = totalEntradas - totalSaidas;
    resumoEntradaValor.textContent = `R$ ${formatarMoeda(totalEntradas)}`;
    resumoSaidaValor.textContent = `R$ ${formatarMoeda(totalSaidas)}`;
    resumoSaldoValor.textContent = `R$ ${formatarMoeda(saldo)}`;
  }

  function renderTudo() {
    renderClassificacoes();
    renderResumoGeral();
    renderTabela();
    // Avisa a tela de Gerenciamento de Contas (saldo de cada conta)
    document.dispatchEvent(new CustomEvent("extrato-atualizado", { detail: { lancamentos: todosOsLancamentos } }));
  }

  // ====================================================
  // FILTROS — disparam nova renderização
  // ====================================================
  buscaInput.addEventListener("input", renderTabela);
  filtroTipo.addEventListener("change", renderTabela);

  btnLimparFiltros.addEventListener("click", () => {
    buscaInput.value = "";
    filtroTipo.value = "todos";
    classificacoesSelecionadas.clear();
    resumoClassificacao.textContent = "Todas";
    renderTabela();
  });

  // ====================================================
  // DADOS DA CONTA (banco/agência/conta) — por banco, dentro do
  // mesmo objeto compartilhado de configuração.
  // ====================================================
  const campoContaBanco = document.getElementById("dadosContaBanco");
  const campoContaAgencia = document.getElementById("dadosContaAgencia");
  const campoContaConta = document.getElementById("dadosContaConta");
  const btnSalvarDadosConta = document.getElementById("btnSalvarDadosConta");

  function dadosConta() {
    return (extratoConfigGeral[BANCO_ATUAL] && extratoConfigGeral[BANCO_ATUAL].dadosConta) || { banco: config.codigoBancoPadrao || "", agencia: "", conta: "" };
  }

  if (campoContaBanco) {
    btnSalvarDadosConta.addEventListener("click", async () => {
      extratoConfigGeral[BANCO_ATUAL].dadosConta = {
        banco: campoContaBanco.value.trim(), agencia: campoContaAgencia.value.trim(), conta: campoContaConta.value.trim(),
      };
      await salvarExtratoConfigGeral();
      mostrarToast("Dados da conta salvos.");
    });
  }

  // ====================================================
  // EXPORTAÇÃO (PDF, Excel, OFX, CNAB240, Impressão) — trabalha
  // em cima do que está FILTRADO na tela, igual antes.
  // ====================================================
  const nomeBancoAtual = config.rotuloBanco || config.nomeBanco || "Banco";
  const btnGerarPdf = document.getElementById("btnGerarPdfExtrato");
  const btnGerarExcel = document.getElementById("btnGerarExcelExtrato");
  const btnGerarOfx = document.getElementById("btnGerarOfxExtrato");
  const btnGerarCnab = document.getElementById("btnGerarCnabExtrato");
  const btnImprimir = document.getElementById("btnImprimirExtrato");

  if (btnGerarPdf) btnGerarPdf.addEventListener("click", () => {
    try { gerarPdfExtrato(aplicarFiltros(), nomeBancoAtual); } catch (e) { mostrarToast("Erro ao gerar PDF: " + e.message, "erro"); }
  });
  if (btnGerarExcel) btnGerarExcel.addEventListener("click", () => {
    try { gerarExcelExtrato(aplicarFiltros(), nomeBancoAtual); } catch (e) { mostrarToast("Erro ao gerar planilha: " + e.message, "erro"); }
  });
  if (btnGerarOfx) btnGerarOfx.addEventListener("click", () => {
    try { gerarOfxExtrato(aplicarFiltros(), nomeBancoAtual, dadosConta()); } catch (e) { mostrarToast("Erro ao gerar OFX: " + e.message, "erro"); }
  });
  if (btnGerarCnab) btnGerarCnab.addEventListener("click", () => {
    try { gerarCnab240Extrato(aplicarFiltros(), nomeBancoAtual, dadosConta()); } catch (e) { mostrarToast("Erro ao gerar CNAB240: " + e.message, "erro"); }
  });
  if (btnImprimir) btnImprimir.addEventListener("click", () => {
    try { imprimirExtrato(aplicarFiltros(), nomeBancoAtual); } catch (e) { mostrarToast("Erro ao imprimir: " + e.message, "erro"); }
  });

  // ====================================================
  // INICIALIZAÇÃO
  // ====================================================
  ["dataLancamento", "descricao", "valor", "classificacao"].forEach((id) => {
    limparErroAoEditar(document.getElementById(id));
  });

  definirTipoModal("entrada");
  await carregarTudo();

  if (campoContaBanco) {
    const dc = dadosConta();
    campoContaBanco.value = dc.banco || "";
    campoContaAgencia.value = dc.agencia || "";
    campoContaConta.value = dc.conta || "";
  }

  renderTudo();
})();