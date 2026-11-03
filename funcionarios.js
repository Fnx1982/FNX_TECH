// ====================================================
// ELEMENTOS
// ====================================================
const modalObra = document.getElementById("modalObra");
const btnAbrirObra = document.getElementById("btnAbrirObra");
const fecharModalObra = document.getElementById("fecharModalObra");
const formObra = document.getElementById("form-obra");
const novaObraInput = document.getElementById("novaObraInput");
const listaObras = document.getElementById("listaObras");

const modalPagamento = document.getElementById("modalPagamento");
const btnAbrirPagamento = document.getElementById("btnAbrirPagamento");
const fecharModalPagamento = document.getElementById("fecharModalPagamento");
const tituloModalPagamento = document.getElementById("tituloModalPagamento");
const form = document.getElementById("form-funcionario");
const selectObra = document.getElementById("obra");
const btnSubmitFuncionario = document.getElementById("btnSubmitFuncionario");

const filtroObra = document.getElementById("filtroObra");

// Multi-select de Meses
const multiMes = document.getElementById("multiMes");
const toggleMes = document.getElementById("toggleMes");
const painelMes = document.getElementById("painelMes");
const resumoMes = document.getElementById("resumoMes");

// Multi-select de Funcionários
const multiNome = document.getElementById("multiNome");
const toggleNome = document.getElementById("toggleNome");
const painelNome = document.getElementById("painelNome");
const resumoNome = document.getElementById("resumoNome");

const btnVisaoObra = document.getElementById("btnVisaoObra");
const btnVisaoFuncionario = document.getElementById("btnVisaoFuncionario");
const gruposDiv = document.getElementById("grupos");
const totalFixoValor = document.getElementById("totalFixoValor");

const popup = document.getElementById("popup-comprovante");
const popupBody = document.getElementById("popup-body");
const fecharPopup = document.getElementById("fecharPopup");
const btnFecharPopup = document.getElementById("btn-fechar-popup");

// ====================================================
// ESTADO
// ====================================================
// Começa com a última cópia salva neste aparelho e, logo em seguida,
// troca pela versão da nuvem (ver INICIALIZAÇÃO no fim do arquivo).
let obras = [...financeiroFuncCache.obras];
let funcionarios = [...financeiroFuncCache.funcionarios];

let visaoAtual = "obra"; // "obra" ou "funcionario"
let indiceEditando = null; // se não for null, o form está editando esse índice
let gruposFechados = new Set(); // guarda quais grupos estão colapsados (pelo título)

const TODOS_OS_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

let mesesSelecionados = new Set(); // vazio = todos os meses
let nomesSelecionados = new Set(); // vazio = todos os funcionários

// ====================================================
// MODAIS — abrir / fechar
// ====================================================
function abrirModal(modal) {
  modal.classList.add("active");
}
function fecharModalEl(modal) {
  modal.classList.remove("active");
}

btnAbrirObra.addEventListener("click", () => abrirModal(modalObra));
fecharModalObra.addEventListener("click", () => fecharModalEl(modalObra));
modalObra.addEventListener("click", (e) => {
  if (e.target === modalObra) fecharModalEl(modalObra);
});

btnAbrirPagamento.addEventListener("click", () => {
  if (indiceEditando === null) {
    form.reset();
    tituloModalPagamento.textContent = "Novo Pagamento";
    btnSubmitFuncionario.textContent = "Adicionar";
  }
  abrirModal(modalPagamento);
});
fecharModalPagamento.addEventListener("click", () => fecharModalEl(modalPagamento));
modalPagamento.addEventListener("click", (e) => {
  if (e.target === modalPagamento) fecharModalEl(modalPagamento);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  fecharModalEl(modalObra);
  fecharModalEl(modalPagamento);
});

// ====================================================
// OBRAS (cadastro fixo, igual Setores)
// ====================================================
function salvarObras() {
  salvarFinanceiroFunc({ obras, funcionarios }); // nuvem
}

function renderObras() {
  // Atualiza o <select> do formulário de pagamento
  const valorSelecionado = selectObra.value;
  selectObra.innerHTML = '<option value="" disabled selected>Selecione a obra</option>';
  obras.forEach((obra) => {
    const opt = document.createElement("option");
    opt.value = obra;
    opt.textContent = obra;
    selectObra.appendChild(opt);
  });
  if (obras.includes(valorSelecionado)) {
    selectObra.value = valorSelecionado;
  }

  // Atualiza o <select> de filtro
  const filtroAtual = filtroObra.value;
  filtroObra.innerHTML = '<option value="todas">Todas</option>';
  obras.forEach((obra) => {
    const opt = document.createElement("option");
    opt.value = obra;
    opt.textContent = obra;
    filtroObra.appendChild(opt);
  });
  if (obras.includes(filtroAtual) || filtroAtual === "todas") {
    filtroObra.value = filtroAtual;
  }

  // Atualiza a lista de chips
  listaObras.innerHTML = "";
  if (obras.length === 0) {
    listaObras.innerHTML = '<p class="sem-obras">Nenhuma obra cadastrada ainda.</p>';
    return;
  }
  obras.forEach((obra, index) => {
    const chip = document.createElement("div");
    chip.className = "chip-obra";
    chip.innerHTML = `<span>${escaparHtml(obra)}</span>`;
    const btnRemover = document.createElement("button");
    btnRemover.textContent = "×";
    btnRemover.title = "Excluir obra";
    btnRemover.addEventListener("click", () => excluirObra(index));
    chip.appendChild(btnRemover);
    listaObras.appendChild(chip);
  });
}

async function excluirObra(index) {
  const nomeObra = obras[index];
  const usada = funcionarios.some((f) => f.obra === nomeObra);
  if (usada) {
    const confirmado = await confirmarAcao(
      `Excluir a obra "${nomeObra}"?`,
      "Os pagamentos já registrados não serão apagados, mas essa obra não vai mais aparecer na lista para novos lançamentos."
    );
    if (!confirmado) return;
  }
  obras.splice(index, 1);
  salvarObras();
  renderObras();
}

formObra.addEventListener("submit", (e) => {
  e.preventDefault();
  const nome = novaObraInput.value.trim();
  if (!nome) return;
  if (obras.includes(nome)) {
    alert("Essa obra já está cadastrada.");
    return;
  }
  obras.push(nome);
  salvarObras();
  renderObras();
  novaObraInput.value = "";
});

// ====================================================
// PAGAMENTOS (cadastro / edição)
// ====================================================
function salvarFuncionarios() {
  salvarFinanceiroFunc({ obras, funcionarios }); // nuvem
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const nome = document.getElementById("nome").value.trim();
  const obra = selectObra.value;
  const mes = document.getElementById("mes").value;
  const valor = document.getElementById("valor").value;
  const file = document.getElementById("comprovante").files[0];

  if (!nome || !obra || !mes || !valor) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  if (indiceEditando !== null) {
    const comprovanteAtual = funcionarios[indiceEditando].comprovante;
    funcionarios[indiceEditando] = {
      nome,
      obra,
      mes,
      valor,
      comprovante: file ? URL.createObjectURL(file) : comprovanteAtual,
    };
    indiceEditando = null;
    btnSubmitFuncionario.textContent = "Adicionar";
    tituloModalPagamento.textContent = "Novo Pagamento";
  } else {
    let comprovante = null;
    if (file) comprovante = URL.createObjectURL(file);
    funcionarios.push({ nome, obra, mes, valor, comprovante });
  }

  salvarFuncionarios();
  form.reset();
  fecharModalEl(modalPagamento);
  renderTudo();
});

function editar(index) {
  const f = funcionarios[index];
  document.getElementById("nome").value = f.nome;
  selectObra.value = f.obra;
  document.getElementById("mes").value = f.mes;
  document.getElementById("valor").value = f.valor;
  indiceEditando = index;
  tituloModalPagamento.textContent = "Editar Pagamento";
  btnSubmitFuncionario.textContent = "Salvar Alterações";
  abrirModal(modalPagamento);
}

async function excluir(index) {
  const confirmado = await confirmarAcao(
    "Excluir pagamento?",
    "Essa ação não pode ser desfeita."
  );
  if (confirmado) {
    funcionarios.splice(index, 1);
    salvarFuncionarios();
    if (indiceEditando === index) {
      indiceEditando = null;
      form.reset();
      btnSubmitFuncionario.textContent = "Adicionar";
      tituloModalPagamento.textContent = "Novo Pagamento";
    }
    renderTudo();
  }
}

// ====================================================
// MULTI-SELECT GENÉRICO (Meses / Funcionários)
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
        if (checkbox.checked) {
          selecionados.add(opcao);
        } else {
          selecionados.delete(opcao);
        }
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
    btnTodos.textContent = "Selecionar todos";
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
    if (selecionados.size === 0) {
      resumoEl.textContent = labelTodos;
    } else if (selecionados.size === 1) {
      resumoEl.textContent = [...selecionados][0];
    } else {
      resumoEl.textContent = `${selecionados.size} selecionados`;
    }
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const estavaAberto = container.classList.contains("open");
    document.querySelectorAll(".multi-select.open").forEach((el) => el.classList.remove("open"));
    if (!estavaAberto) {
      renderPainel();
      container.classList.add("open");
    }
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove("open");
    }
  });

  atualizarResumo();

  return { renderPainel, atualizarResumo };
}

const multiSelectMeses = configurarMultiSelect({
  painel: painelMes,
  toggle: toggleMes,
  container: multiMes,
  resumoEl: resumoMes,
  getOpcoes: () => TODOS_OS_MESES,
  selecionados: mesesSelecionados,
  labelTodos: "Todos",
  onChange: renderGruposSeguro,
});

const multiSelectNomes = configurarMultiSelect({
  painel: painelNome,
  toggle: toggleNome,
  container: multiNome,
  resumoEl: resumoNome,
  getOpcoes: () => [...new Set(funcionarios.map((f) => f.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  selecionados: nomesSelecionados,
  labelTodos: "Todos",
  onChange: renderGruposSeguro,
});

function renderGruposSeguro() {
  if (typeof renderGrupos === "function") renderGrupos();
}

// ====================================================
// FILTRAGEM
// ====================================================
function aplicarFiltros() {
  const obraSel = filtroObra.value;

  return funcionarios
    .map((f, indexOriginal) => ({ ...f, indexOriginal }))
    .filter((f) => {
      const mesOK = mesesSelecionados.size === 0 || mesesSelecionados.has(f.mes);
      const obraOK = obraSel === "todas" || f.obra === obraSel;
      const nomeOK = nomesSelecionados.size === 0 || nomesSelecionados.has(f.nome);
      return mesOK && obraOK && nomeOK;
    });
}

// ====================================================
// RENDERIZAÇÃO AGRUPADA
// ====================================================
function chaveGrupo(item) {
  if (visaoAtual === "obra") {
    return `${item.obra} — ${item.mes}`;
  }
  return `${item.nome} — ${item.mes}`;
}

function tituloGrupo(item) {
  if (visaoAtual === "obra") {
    return `${escaparHtml(item.obra)} · ${item.mes}`;
  }
  return `${escaparHtml(item.nome)} · ${item.mes}`;
}

function renderGrupos() {
  const itensFiltrados = aplicarFiltros();
  gruposDiv.innerHTML = "";

  if (itensFiltrados.length === 0) {
    gruposDiv.innerHTML = '<div class="sem-resultados">Nenhum pagamento encontrado com esses filtros.</div>';
    atualizarTotalFixo(0);
    return;
  }

  const grupos = new Map();
  itensFiltrados.forEach((item) => {
    const chave = chaveGrupo(item);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  });

  let totalGeral = 0;
  const chavesOrdenadas = [...grupos.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));

  chavesOrdenadas.forEach((chave) => {
    const itens = grupos.get(chave);
    const subtotal = itens.reduce((soma, f) => soma + parseFloat(f.valor || 0), 0);
    totalGeral += subtotal;

    const fechado = gruposFechados.has(chave);

    const grupoEl = document.createElement("div");
    grupoEl.className = "grupo" + (fechado ? " fechado" : "");

    const cabecalho = document.createElement("div");
    cabecalho.className = "grupo-cabecalho";
    cabecalho.innerHTML = `
      <span class="grupo-titulo"><span class="grupo-seta">▾</span> ${tituloGrupo(itens[0])}</span>
      <span class="grupo-subtotal">R$ ${subtotal.toFixed(2)}</span>
    `;
    cabecalho.addEventListener("click", () => {
      if (gruposFechados.has(chave)) {
        gruposFechados.delete(chave);
      } else {
        gruposFechados.add(chave);
      }
      renderGrupos();
    });

    const corpo = document.createElement("div");
    corpo.className = "grupo-corpo";

    const table = document.createElement("table");
    const colunaExtra = visaoAtual === "obra" ? "Funcionário" : "Obra";
    table.innerHTML = `
      <thead>
        <tr>
          <th>${colunaExtra}</th>
          <th>Valor Pago</th>
          <th>Comprovante</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    itens.forEach((f) => {
      const tr = document.createElement("tr");
      const valorColunaExtra = visaoAtual === "obra" ? f.nome : f.obra;
      const botaoVer = f.comprovante
        ? `<button class="btn-view" data-comprovante-index="${f.indexOriginal}">Ver</button>`
        : "—";
      tr.innerHTML = `
        <td>${escaparHtml(valorColunaExtra)}</td>
        <td>R$ ${parseFloat(f.valor).toFixed(2)}</td>
        <td>${botaoVer}</td>
        <td>
          <button class="btn-editar" data-edit-index="${f.indexOriginal}">Editar</button>
          <button class="btn-excluir-item" data-delete-index="${f.indexOriginal}">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    corpo.appendChild(table);
    grupoEl.appendChild(cabecalho);
    grupoEl.appendChild(corpo);
    gruposDiv.appendChild(grupoEl);
  });

  gruposDiv.querySelectorAll("[data-edit-index]").forEach((btn) => {
    btn.addEventListener("click", () => editar(parseInt(btn.dataset.editIndex, 10)));
  });
  gruposDiv.querySelectorAll("[data-delete-index]").forEach((btn) => {
    btn.addEventListener("click", () => excluir(parseInt(btn.dataset.deleteIndex, 10)));
  });
  gruposDiv.querySelectorAll("[data-comprovante-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.comprovanteIndex, 10);
      abrirPopup(funcionarios[idx].comprovante);
    });
  });

  atualizarTotalFixo(totalGeral);
}

function atualizarTotalFixo(total) {
  totalFixoValor.textContent = `R$ ${total.toFixed(2)}`;
}

function renderTudo() {
  renderObras();
  renderGrupos();
}

// ====================================================
// ALTERNADOR DE VISÃO
// ====================================================
btnVisaoObra.addEventListener("click", () => {
  visaoAtual = "obra";
  btnVisaoObra.classList.add("active");
  btnVisaoFuncionario.classList.remove("active");
  gruposFechados.clear();
  renderGrupos();
});

btnVisaoFuncionario.addEventListener("click", () => {
  visaoAtual = "funcionario";
  btnVisaoFuncionario.classList.add("active");
  btnVisaoObra.classList.remove("active");
  gruposFechados.clear();
  renderGrupos();
});

// ====================================================
// POPUP DO COMPROVANTE
// ====================================================
function abrirPopup(url) {
  popup.style.display = "flex";
  popupBody.innerHTML = "";

  if (!url) {
    popupBody.innerHTML = "<p>Nenhum comprovante disponível.</p>";
    return;
  }

  if (url.endsWith(".pdf")) {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "500px";
    iframe.style.border = "none";
    popupBody.appendChild(iframe);
  } else {
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "80vh";
    img.style.borderRadius = "10px";
    popupBody.appendChild(img);
  }
}

function fecharModal() {
  popup.style.display = "none";
  popupBody.innerHTML = "";
}

fecharPopup.addEventListener("click", fecharModal);
btnFecharPopup.addEventListener("click", fecharModal);
popup.addEventListener("click", (e) => {
  if (e.target === popup) fecharModal();
});

// ====================================================
// FILTROS — disparam nova renderização
// ====================================================
filtroObra.addEventListener("change", renderGrupos);

// ====================================================
// INICIALIZAÇÃO — mostra a cópia local na hora e atualiza com a nuvem
// ====================================================
renderTudo();
carregarFinanceiroFunc().then((dados) => {
  obras = [...dados.obras];
  funcionarios = [...dados.funcionarios];
  renderTudo();
});