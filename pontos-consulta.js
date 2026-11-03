// ============================================================
// pontos-consulta.js
// Tela do gestor: consulta pontos de todos os funcionários,
// edita batidas, adiciona lançamentos, configura jornadas.
// ============================================================

// CEO (login fixo) e qualquer usuário com permissão sempre têm acesso.
const _userTypePontos = (localStorage.getItem("userType") || "").toLowerCase();
const _temPermissaoPontos = _userTypePontos === "ceo" || podeAlterarPontosDeOutros();

if (!_temPermissaoPontos) {
  mostrarToast("Sem permissão para acessar esta área.", "erro");
  setTimeout(() => window.location.href = "home.html", 1500);
}

// ── Upload de anexo de lançamento (atestado, comprovante...) ──────
// Mesmo padrão usado em Visita Técnica/Armazenamento: sobe o arquivo
// de verdade pro R2 e guarda só a CHAVE no lançamento — nunca um link
// direto, e nunca um blob local (que sumiria ao recarregar a página
// ou não existiria em outro dispositivo).
function uploadAnexoLancamento(arquivo) {
  return new Promise((resolve, reject) => {
    const chave = `pontos-lancamentos/${Date.now()}_${arquivo.name}`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${AUTH_WORKER_URL}?action=put&key=${encodeURIComponent(chave)}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = () => { if (xhr.status < 300) resolve(chave); else reject(new Error("Falha ao enviar anexo (" + xhr.status + ")")); };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar anexo"));
    xhr.send(arquivo);
  });
}
function urlAnexoLancamento(chave) {
  const token = pegarTokenDownloadCache();
  return `${AUTH_WORKER_URL}?action=get&key=${encodeURIComponent(chave)}&token=${encodeURIComponent(token)}`;
}

const NOMES_MESES = NOMES_MESES_PONTO;
const TIPOS_COM_PERIODO = ["abono", "atestado", "declaracao"];
let abaAtiva = "funcionarios";
let funcSelecionado = null; // { registro, nome } do funcionário no modal de detalhe
let batidaEditandoId = null;
let lancamentoEditandoId = null;

// ====================================================
// ABAS
// ====================================================
document.querySelectorAll("[data-aba]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-aba]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    abaAtiva = btn.dataset.aba;
    document.getElementById("abaFuncionarios").style.display = abaAtiva === "funcionarios" ? "block" : "none";
    document.getElementById("abaLancamentos").style.display = abaAtiva === "lancamentos" ? "block" : "none";
    document.getElementById("abaJornadas").style.display = abaAtiva === "jornadas" ? "block" : "none";
    document.getElementById("abaFeriados").style.display = abaAtiva === "feriados" ? "block" : "none";
    if (abaAtiva === "lancamentos") renderLancamentosGestor();
    if (abaAtiva === "jornadas") renderJornadas();
    if (abaAtiva === "feriados") renderAbaFeriados();
  });
});

// ====================================================
// FUNCIONÁRIOS (aba principal)
// ====================================================
// A lista de funcionários agora vive no servidor (Worker + KV), não
// mais em localStorage["usuarios"]. Para não precisar reescrever
// toda função síncrona que chama listarFuncionarios() nesta página,
// mantemos um cache local em memória, carregado uma vez no início
// (ver iniciarPontosConsulta() no fim do arquivo) e atualizado
// sempre que necessário via sincronizarFuncionariosCache().
let _funcionariosCache = [];

function listarFuncionarios() {
  return _funcionariosCache;
}

async function sincronizarFuncionariosCache() {
  const resposta = await apiListarUsuariosBasico();
  if (resposta.ok) _funcionariosCache = resposta.usuarios;
  return resposta;
}

function popularFiltrosConsulta() {
  const mesEl = document.getElementById("filtroMesConsulta");
  const anoEl = document.getElementById("filtroAnoConsulta");
  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();

  mesEl.innerHTML = "";
  NOMES_MESES.forEach((nome, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = nome;
    if (i === mesAtual) opt.selected = true;
    mesEl.appendChild(opt);
  });

  anoEl.innerHTML = "";
  for (let a = anoAtual; a >= anoAtual - 3; a--) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === anoAtual) opt.selected = true;
    anoEl.appendChild(opt);
  }

  mesEl.addEventListener("change", renderTabelaFuncionarios);
  anoEl.addEventListener("change", renderTabelaFuncionarios);
}

function renderTabelaFuncionarios() {
  const termo = document.getElementById("buscaFuncionario").value.trim().toLowerCase();
  const tbody = document.getElementById("tbodyFuncionarios");
  const semEl = document.getElementById("semFuncionarios");
  const funcionarios = listarFuncionarios().filter((f) =>
    termo === "" || f.nome.toLowerCase().includes(termo) || String(f.registro).includes(termo)
  );

  tbody.innerHTML = "";
  if (funcionarios.length === 0) { semEl.style.display = "block"; return; }
  semEl.style.display = "none";

  funcionarios.forEach((f) => {
    const banco = calcularBancoHorasCompleto(f.registro);
    const tr = document.createElement("tr");
    const corSaldo = banco.saldo >= 0 ? "#1c8a4b" : "crimson";
    tr.innerHTML = `
      <td>${escaparHtml(f.nome)}</td>
      <td>${escaparHtml(f.registro)}</td>
      <td>${formatarHoras(banco.jornada)}/dia</td>
      <td>${formatarHoras(banco.horasTrabalhadas)}</td>
      <td style="color:${corSaldo};font-weight:700;">${banco.saldo >= 0 ? "+" : ""}${formatarHoras(banco.saldo)}</td>
      <td>
        <button class="btn-editar-mini" data-ver="${escaparHtml(f.registro)}" data-nome="${escaparHtml(f.nome)}">Ver Detalhes</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-ver]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalDetalhe(btn.dataset.ver, btn.dataset.nome));
  });
}

document.getElementById("buscaFuncionario").addEventListener("input", renderTabelaFuncionarios);
document.getElementById("btnLimparFiltros").addEventListener("click", () => {
  document.getElementById("buscaFuncionario").value = "";
  renderTabelaFuncionarios();
});

// ====================================================
// MODAL DETALHE DO FUNCIONÁRIO
// ====================================================
function abrirModalDetalhe(registro, nome) {
  funcSelecionado = { registro, nome };
  document.getElementById("tituloModalDetalhe").textContent = nome;
  popularFiltrosModal();
  renderModalBanco();
  renderModalBatidas();
  renderModalLancamentos();
  document.getElementById("btnZerarBanco").style.display = podeAlterarPontosDeOutros() ? "" : "none";
  document.getElementById("modalDetalhe").classList.add("active");
}

document.getElementById("fecharModalDetalhe").addEventListener("click", () => {
  document.getElementById("modalDetalhe").classList.remove("active");
  funcSelecionado = null;
});
document.getElementById("modalDetalhe").addEventListener("click", (e) => {
  if (e.target.id === "modalDetalhe") {
    document.getElementById("modalDetalhe").classList.remove("active");
    funcSelecionado = null;
  }
});

function popularFiltrosModal() {
  const mesEl = document.getElementById("modalFiltroMes");
  const anoEl = document.getElementById("modalFiltroAno");
  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();

  mesEl.innerHTML = "";
  NOMES_MESES.forEach((nome, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = nome;
    if (i === mesAtual) opt.selected = true;
    mesEl.appendChild(opt);
  });

  anoEl.innerHTML = "";
  for (let a = anoAtual; a >= anoAtual - 3; a--) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === anoAtual) opt.selected = true;
    anoEl.appendChild(opt);
  }

  mesEl.addEventListener("change", () => { renderModalBatidas(); renderModalBanco(); });
  anoEl.addEventListener("change", () => { renderModalBatidas(); renderModalBanco(); });
}

function renderModalBanco() {
  if (!funcSelecionado) return;
  const banco = calcularBancoHorasCompleto(funcSelecionado.registro);
  const container = document.getElementById("bancoModalCards");
  const corSaldo = banco.saldo >= 0 ? "positivo" : "negativo";
  container.innerHTML = `
    <div class="card-banco"><div class="rotulo">Jornada</div><div class="valor neutro">${formatarHoras(banco.jornada)}/dia</div></div>
    <div class="card-banco"><div class="rotulo">Trabalhadas</div><div class="valor neutro">${formatarHoras(banco.horasTrabalhadas)}</div></div>
    <div class="card-banco"><div class="rotulo">Saldo</div><div class="valor ${corSaldo}">${banco.saldo >= 0 ? "+" : ""}${formatarHoras(banco.saldo)}</div></div>
    <div class="card-banco"><div class="rotulo">Dias</div><div class="valor neutro">${banco.diasTrabalhados}</div></div>
    ${banco.zeradoEm ? `<div style="grid-column:1/-1;font-size:12px;color:#777;">⟲ Banco zerado em ${new Date(banco.zeradoEm + "T12:00:00").toLocaleDateString("pt-BR")} — saldo, trabalhadas e dias contam a partir do dia seguinte.</div>` : ""}
  `;
}

function renderModalBatidas() {
  if (!funcSelecionado) return;
  const mes = parseInt(document.getElementById("modalFiltroMes").value);
  const ano = parseInt(document.getElementById("modalFiltroAno").value);
  const container = document.getElementById("batidasModalContainer");
  const jornada = getJornadaFuncionario(funcSelecionado.registro);

  const registros = lerRegistros().filter((r) => {
    if (r.registroFuncionario !== funcSelecionado.registro) return false;
    const d = new Date(r.dataHora);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });

  const dias = [...new Set(registros.map((r) => r.dataHora.slice(0, 10)))].sort((a, b) => b.localeCompare(a));

  if (dias.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">Sem batidas neste mês.</p>';
    return;
  }

  container.innerHTML = "";
  dias.forEach((data) => {
    const batidasDia = registros
      .filter((r) => r.dataHora.startsWith(data))
      .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));

    const horasDia = calcularHorasTrabalhadasNoDia(batidasDia);
    const saldoDia = horasDia - jornada;
    const corSaldo = saldoDia >= 0 ? "#1c8a4b" : "crimson";

    const div = document.createElement("div");
    div.style.cssText = "background:rgba(255,255,255,0.8);border-radius:8px;padding:12px;margin-bottom:8px;";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>${formatarDataBR(data)}</strong>
        <span style="color:${corSaldo};font-weight:700;">${formatarHoras(horasDia)} (${saldoDia >= 0 ? "+" : ""}${formatarHoras(saldoDia)})</span>
      </div>
      <div class="lista-batidas" style="margin-bottom:0;">
        ${batidasDia.map((b) => `
          <div class="chip-batida">
            <span class="horario">${formatarHoraBR(b.dataHora)}</span>
            <span class="tipo-batida tipo-${b.tipo}">${b.tipo === "entrada" ? "Entrada" : "Saída"}</span>
            ${b.obs ? `<span style="font-size:11px;color:#888;">${b.obs}</span>` : ""}
            <button class="btn-editar-mini" data-edit-bat="${b.id}">Editar</button>
            <button class="btn-excluir-mini" data-del-bat="${b.id}">Excluir</button>
          </div>
        `).join("")}
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("[data-edit-bat]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalBatida(btn.dataset.editBat));
  });
  container.querySelectorAll("[data-del-bat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir esta batida?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await excluirBatida(btn.dataset.delBat);
      renderModalBatidas();
      renderModalBanco();
      renderTabelaFuncionarios();
    });
  });
}

function renderDocumentoLanc(l) {
  if (!l.documentoChave) return "";
  return `<button class="btn-editar-mini" onclick="window.open('${urlAnexoLancamento(l.documentoChave)}','_blank')" style="background:rgba(43,108,176,0.15);color:#2b6cb0;">📄 ${escaparHtml(l.documentoNome) || "Ver doc"}</button>`;
}

function renderModalLancamentos() {
  if (!funcSelecionado) return;
  const container = document.getElementById("lancamentosModalContainer");
  const lancamentos = getLancamentosFuncionario(funcSelecionado.registro);

  if (lancamentos.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">Sem lançamentos.</p>';
    return;
  }

  container.innerHTML = "";
  lancamentos.forEach((l) => {
    const info = TIPOS_LANCAMENTO[l.tipo] || { rotulo: l.tipo, efeito: "neutro" };
    const item = document.createElement("div");
    item.className = "lancamento-item";
    item.innerHTML = `
      <div class="lancamento-info">
        <span class="lancamento-tipo tipo-${info.efeito}">${info.rotulo}</span>
        <div class="lancamento-descricao">${formatarDataBR(l.data)}${l.horaInicio && l.horaFim ? " (" + l.horaInicio + " às " + l.horaFim + ")" : ""}${l.feriasInicio && l.feriasFim ? " (férias: " + formatarDataBR(l.feriasInicio) + " a " + formatarDataBR(l.feriasFim) + ")" : ""} ${l.descricao ? "— " + escaparHtml(l.descricao) : ""} ${renderDocumentoLanc(l)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="lancamento-horas">${l.tipo === "zeragem" ? "→ 0h" : (info.efeito === "credito" ? "+" : info.efeito === "debito" ? "-" : "") + formatarHoras(Math.abs(l.horas))}</div>
        <div class="lancamento-acoes">
          ${l.tipo === "zeragem" ? "" : `<button class="btn-editar-mini" data-edit-lanc="${l.id}">Editar</button>`}
          <button class="btn-excluir-mini" data-del-lanc="${l.id}">${l.tipo === "zeragem" ? "Desfazer" : "Excluir"}</button>
        </div>
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll("[data-edit-lanc]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalLancamento(btn.dataset.editLanc));
  });
  container.querySelectorAll("[data-del-lanc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir lançamento?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await excluirLancamento(btn.dataset.delLanc);
      renderModalLancamentos();
      renderModalBanco();
      renderTabelaFuncionarios();
    });
  });
}

// ====================================================
// ZERAR BANCO DE HORAS (só gestor — o Worker confere de novo)
// ====================================================
function hojeISOConsulta() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
document.getElementById("btnZerarBanco").addEventListener("click", () => {
  if (!funcSelecionado) return;
  const banco = calcularBancoHorasCompleto(funcSelecionado.registro);
  document.getElementById("textoZerarBanco").innerHTML =
    `Saldo atual de <b>${escaparHtml(funcSelecionado.nome)}</b>: <b style="color:${banco.saldo >= 0 ? "#1c8a4b" : "crimson"}">${banco.saldo >= 0 ? "+" : ""}${formatarHoras(banco.saldo)}</b>`;
  document.getElementById("dataZerarBanco").value = hojeISOConsulta();
  document.getElementById("dataZerarBanco").max = hojeISOConsulta();
  document.getElementById("motivoZerarBanco").value = "";
  document.getElementById("modalZerarBanco").classList.add("active");
});
["fecharModalZerarBanco", "cancelarZerarBanco"].forEach((id) =>
  document.getElementById(id).addEventListener("click", () => document.getElementById("modalZerarBanco").classList.remove("active")));
document.getElementById("confirmarZerarBanco").addEventListener("click", async () => {
  if (!funcSelecionado) return;
  const data = document.getElementById("dataZerarBanco").value;
  const motivo = document.getElementById("motivoZerarBanco").value.trim();
  if (!data) { mostrarToast("Escolha a data.", "erro"); return; }
  if (data > hojeISOConsulta()) { mostrarToast("Não dá pra zerar com data no futuro.", "erro"); return; }
  if (!motivo) { mostrarToast("Escreva o motivo (fica registrado).", "erro"); return; }
  const corteAtual = dataUltimaZeragem(funcSelecionado.registro);
  if (corteAtual && data <= corteAtual) {
    mostrarToast(`O banco já foi zerado em ${new Date(corteAtual + "T12:00:00").toLocaleDateString("pt-BR")}. Escolha uma data depois dessa.`, "erro");
    return;
  }
  // Saldo até o fim do dia escolhido = o que será zerado (fica registrado)
  const saldoZerado = calcularBancoHorasCompleto(funcSelecionado.registro, data).saldo;

  const ok = await confirmarAcao(`Zerar o banco de ${funcSelecionado.nome}?`,
    `Saldo até ${new Date(data + "T12:00:00").toLocaleDateString("pt-BR")}: ${saldoZerado >= 0 ? "+" : ""}${formatarHoras(saldoZerado)} → 0h00min.`);
  if (!ok) return;
  const botao = document.getElementById("confirmarZerarBanco");
  botao.disabled = true;
  const resp = await adicionarLancamento({
    registroFuncionario: funcSelecionado.registro,
    nomeFuncionario: funcSelecionado.nome,
    tipo: "zeragem",
    data,
    horas: 0,
    descricao: `Saldo zerado: ${saldoZerado >= 0 ? "+" : ""}${formatarHoras(saldoZerado)}. Motivo: ${motivo}`,
  });
  botao.disabled = false;
  if (!resp.ok) { mostrarToast(resp.erro || "Não foi possível zerar.", "erro"); return; }
  document.getElementById("modalZerarBanco").classList.remove("active");
  mostrarToast("Banco de horas zerado.");
  renderModalBanco();
  renderModalLancamentos();
  renderTabelaFuncionarios();
});

document.getElementById("btnAdicionarBatida").addEventListener("click", () => abrirModalBatida(null));
document.getElementById("btnAdicionarLancamentoDetalhe").addEventListener("click", () => abrirModalLancamento(null));
document.getElementById("btnExportarPdfPontos").addEventListener("click", () => {
  if (funcSelecionado) document.getElementById("modalExportarPdf").classList.add("active");
});

document.getElementById("fecharModalExportarPdf").addEventListener("click", () =>
  document.getElementById("modalExportarPdf").classList.remove("active"));
document.getElementById("cancelarModalExportarPdf").addEventListener("click", () =>
  document.getElementById("modalExportarPdf").classList.remove("active"));
document.getElementById("modalExportarPdf").addEventListener("click", (e) => {
  if (e.target.id === "modalExportarPdf") document.getElementById("modalExportarPdf").classList.remove("active");
});

document.getElementById("btnMarcarTodasSecoes").addEventListener("click", () => {
  ["pdfSecDadosFuncionario","pdfSecResumo","pdfSecEspelho","pdfSecLancamentos","pdfSecLocalizacao","pdfSecAssinatura"]
    .forEach((id) => { document.getElementById(id).checked = true; });
});
document.getElementById("btnDesmarcarTodasSecoes").addEventListener("click", () => {
  ["pdfSecDadosFuncionario","pdfSecResumo","pdfSecEspelho","pdfSecLancamentos","pdfSecLocalizacao","pdfSecAssinatura"]
    .forEach((id) => { document.getElementById(id).checked = false; });
});

document.getElementById("confirmarExportarPdf").addEventListener("click", () => {
  const secoes = {
    dadosFuncionario: document.getElementById("pdfSecDadosFuncionario").checked,
    resumo:          document.getElementById("pdfSecResumo").checked,
    espelho:         document.getElementById("pdfSecEspelho").checked,
    lancamentos:     document.getElementById("pdfSecLancamentos").checked,
    localizacao:     document.getElementById("pdfSecLocalizacao").checked,
    assinatura:      document.getElementById("pdfSecAssinatura").checked,
  };

  if (!Object.values(secoes).some(Boolean)) {
    mostrarToast("Selecione ao menos uma seção.", "erro");
    return;
  }

  document.getElementById("modalExportarPdf").classList.remove("active");
  if (funcSelecionado) gerarPdfMensalPontos(funcSelecionado.registro, funcSelecionado.nome, secoes);
});

// ====================================================
// MODAL BATIDA
// ====================================================
function abrirModalBatida(id) {
  batidaEditandoId = id || null;
  document.getElementById("tituloModalBatida").textContent = id ? "Editar Batida" : "Adicionar Batida";

  if (id) {
    const bat = lerRegistros().find((r) => r.id === id);
    if (bat) {
      const dt = new Date(bat.dataHora);
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById("campoDataHoraBatida").value = local;
      document.getElementById("campoTipoBatida").value = bat.tipo;
      document.getElementById("campoObsBatida").value = bat.obs || "";
    }
  } else {
    const agora = new Date();
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById("campoDataHoraBatida").value = local;
    document.getElementById("campoTipoBatida").value = "entrada";
    document.getElementById("campoObsBatida").value = "";
  }
  document.getElementById("modalBatida").classList.add("active");
}

document.getElementById("fecharModalBatida").addEventListener("click", () => document.getElementById("modalBatida").classList.remove("active"));
document.getElementById("cancelarModalBatida").addEventListener("click", () => document.getElementById("modalBatida").classList.remove("active"));

document.getElementById("salvarModalBatida").addEventListener("click", async () => {
  const dataHoraVal = document.getElementById("campoDataHoraBatida").value;
  const tipo = document.getElementById("campoTipoBatida").value;
  const obs = document.getElementById("campoObsBatida").value.trim();

  if (!dataHoraVal) { mostrarToast("Informe a data e hora.", "erro"); return; }

  const dataHoraISO = new Date(dataHoraVal).toISOString();

  let resposta;
  if (batidaEditandoId) {
    resposta = await editarBatida(batidaEditandoId, { dataHora: dataHoraISO, tipo, obs });
  } else {
    resposta = await criarBatidaManual({
      registroFuncionario: funcSelecionado.registro,
      nomeFuncionario: funcSelecionado.nome,
      dataHora: dataHoraISO,
      tipo,
      obs,
    });
  }
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar a batida.", "erro"); return; }

  document.getElementById("modalBatida").classList.remove("active");
  renderModalBatidas();
  renderModalBanco();
  renderTabelaFuncionarios();
  mostrarToast("Batida salva.");
});

// ====================================================
// MODAL LANÇAMENTO
// ====================================================
function popularSelectFuncionarios(registroFixo) {
  const select = document.getElementById("campoFuncLancamento");
  const funcionarios = listarFuncionarios();
  select.innerHTML = "";
  funcionarios.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.registro;
    opt.textContent = `${f.nome} (${f.registro})`;
    if (String(f.registro) === String(registroFixo)) opt.selected = true;
    select.appendChild(opt);
  });
  if (registroFixo) select.disabled = true;
  else select.disabled = false;
}

let _documentoChaveAtual = null; // chave R2 do anexo do lançamento sendo editado

function abrirModalLancamento(id) {
  lancamentoEditandoId = id || null;
  _documentoChaveAtual = null;
  document.getElementById("tituloModalLancamento").textContent = id ? "Editar Lançamento" : "Novo Lançamento";
  document.getElementById("campoDataLancamento").value = dataHoje();
  document.getElementById("campoArquivoLancamento").value = "";
  document.getElementById("docAtualLancamento").style.display = "none";
  document.getElementById("campoHoraInicio").value = "";
  document.getElementById("campoHoraFim").value = "";
  document.getElementById("campoPeriodoLancamento").style.display = "none";
  document.getElementById("campoFeriasInicio").value = "";
  document.getElementById("campoFeriasFim").value = "";
  document.getElementById("feriasDiasCalc").textContent = "";
  document.getElementById("campoPeriodoFerias").style.display = "none";

  if (id) {
    const l = lerLancamentos().find((x) => x.id === id);
    if (l) {
      popularSelectFuncionarios(l.registroFuncionario);
      document.getElementById("campoTipoLancamento").value = l.tipo;
      document.getElementById("campoDataLancamento").value = l.data;
      document.getElementById("campoHorasLancamento").value = Math.trunc(l.horas);
      document.getElementById("campoMinutosLancamento").value = Math.round((Math.abs(l.horas) % 1) * 60);
      document.getElementById("campoDescLancamento").value = l.descricao || "";
      // Preenche período se existir
      if (l.horaInicio) document.getElementById("campoHoraInicio").value = l.horaInicio;
      if (l.horaFim) document.getElementById("campoHoraFim").value = l.horaFim;
      if (TIPOS_COM_PERIODO.includes(l.tipo)) {
        document.getElementById("campoPeriodoLancamento").style.display = "block";
      }
      if (l.tipo === "ferias") {
        document.getElementById("campoPeriodoFerias").style.display = "block";
        if (l.feriasInicio) document.getElementById("campoFeriasInicio").value = l.feriasInicio;
        if (l.feriasFim) document.getElementById("campoFeriasFim").value = l.feriasFim;
        calcularDiasUteisFerias();
      }
      if (l.documentoChave) {
        _documentoChaveAtual = l.documentoChave;
        document.getElementById("docAtualNome").textContent = l.documentoNome || "documento";
        document.getElementById("docAtualLancamento").style.display = "block";
      }
    }
  } else {
    popularSelectFuncionarios(funcSelecionado ? funcSelecionado.registro : null);
    document.getElementById("campoTipoLancamento").value = "hora_extra";
    document.getElementById("campoHorasLancamento").value = "";
    document.getElementById("campoMinutosLancamento").value = "";
    document.getElementById("campoDescLancamento").value = "";
  }

  document.getElementById("modalLancamento").classList.add("active");
}

document.getElementById("fecharModalLancamento").addEventListener("click", () => document.getElementById("modalLancamento").classList.remove("active"));
document.getElementById("cancelarModalLancamento").addEventListener("click", () => document.getElementById("modalLancamento").classList.remove("active"));
document.getElementById("btnRemoverDocLancamento").addEventListener("click", () => {
  _documentoChaveAtual = null;
  document.getElementById("docAtualLancamento").style.display = "none";
});

// Mostra campo de período para tipos que têm ausência com hora início/fim
document.getElementById("campoTipoLancamento").addEventListener("change", (e) => {
  const tipo = e.target.value;
  const temPeriodo = TIPOS_COM_PERIODO.includes(tipo);
  const ehFerias = tipo === "ferias";
  document.getElementById("campoPeriodoLancamento").style.display = temPeriodo ? "block" : "none";
  document.getElementById("campoPeriodoFerias").style.display = ehFerias ? "block" : "none";
  if (ehFerias) {
    document.getElementById("campoHorasLancamento").value = "";
    document.getElementById("campoMinutosLancamento").value = "";
  }
});

function calcularDiasUteisFerias() {
  const inicio = document.getElementById("campoFeriasInicio").value;
  const fim = document.getElementById("campoFeriasFim").value;
  const regFunc = document.getElementById("campoFuncLancamento").value;
  const calcEl = document.getElementById("feriasDiasCalc");

  if (!inicio || !fim) { calcEl.textContent = ""; return; }

  const d1 = new Date(inicio + "T12:00:00");
  const d2 = new Date(fim + "T12:00:00");
  if (d2 < d1) { calcEl.textContent = "Data fim deve ser após a data início."; return; }

  let diasUteis = 0;
  let totalDias = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const iso = cur.toISOString().slice(0, 10);
    totalDias++;
    if (ehDiaUtil(iso, regFunc)) diasUteis++;
    cur.setDate(cur.getDate() + 1);
  }

  // Converte dias úteis em horas
  const jornadaFunc = getJornadaFuncionario(regFunc);
  const totalHoras = diasUteis * jornadaFunc;
  const h = Math.floor(totalHoras);
  const m = Math.round((totalHoras - h) * 60);

  calcEl.textContent = `${totalDias} dias corridos → ${diasUteis} dias úteis → ${h}h${String(m).padStart(2,"0")}min`;

  // Preenche automaticamente os campos de horas e minutos
  document.getElementById("campoHorasLancamento").value = h;
  document.getElementById("campoMinutosLancamento").value = m;

  // Preenche a data do lançamento com a data início
  document.getElementById("campoDataLancamento").value = inicio;
}

document.getElementById("campoFeriasInicio").addEventListener("change", calcularDiasUteisFerias);
document.getElementById("campoFeriasFim").addEventListener("change", calcularDiasUteisFerias);

// Calcula automaticamente as horas a partir do período
function calcularHorasDoPeriodo() {
  const inicio = document.getElementById("campoHoraInicio").value;
  const fim = document.getElementById("campoHoraFim").value;
  if (!inicio || !fim) return;
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const totalMin = (hf * 60 + mf) - (hi * 60 + mi);
  if (totalMin <= 0) return;
  document.getElementById("campoHorasLancamento").value = Math.floor(totalMin / 60);
  document.getElementById("campoMinutosLancamento").value = totalMin % 60;
}
document.getElementById("campoHoraInicio").addEventListener("change", calcularHorasDoPeriodo);
document.getElementById("campoHoraFim").addEventListener("change", calcularHorasDoPeriodo);

document.getElementById("salvarModalLancamento").addEventListener("click", async () => {
  const registroFunc = document.getElementById("campoFuncLancamento").value;
  const tipo = document.getElementById("campoTipoLancamento").value;
  const data = document.getElementById("campoDataLancamento").value;
  const horasVal = document.getElementById("campoHorasLancamento").value;
  const minutosVal = document.getElementById("campoMinutosLancamento").value;
  const descricao = document.getElementById("campoDescLancamento").value.trim();
  const arquivoInput = document.getElementById("campoArquivoLancamento");
  const arquivo = arquivoInput.files[0];

  if (!data || (horasVal === "" && minutosVal === "")) {
    mostrarToast("Informe a data e a duração.", "erro"); return;
  }

  const horasInt = parseInt(horasVal) || 0;
  const minutosInt = Math.min(59, Math.abs(parseInt(minutosVal) || 0));
  const sinal = horasInt < 0 ? -1 : 1;
  const horas = sinal * (Math.abs(horasInt) + minutosInt / 60);
  const funcObj = listarFuncionarios().find((f) => String(f.registro) === String(registroFunc));
  const nomeFuncionario = funcObj ? funcObj.nome : registroFunc;

  const botaoSalvar = document.getElementById("salvarModalLancamento");
  const textoOriginalBotao = botaoSalvar.textContent;

  // Processa arquivo: se um arquivo novo foi escolhido, sobe ele de
  // verdade pro R2 agora; senão mantém a chave já salva no lançamento.
  let documentoChave = null;
  let documentoNome = null;
  if (arquivo) {
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Enviando anexo...";
    try {
      documentoChave = await uploadAnexoLancamento(arquivo);
      documentoNome = arquivo.name;
    } catch (e) {
      mostrarToast(e.message || "Erro ao enviar o anexo.", "erro");
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = textoOriginalBotao;
      return;
    }
  } else if (_documentoChaveAtual) {
    documentoChave = _documentoChaveAtual;
    const l = lancamentoEditandoId ? lerLancamentos().find((x) => x.id === lancamentoEditandoId) : null;
    documentoNome = l ? l.documentoNome : null;
  }

  const dadosLanc = {
    tipo, data, horas, descricao, documentoChave, documentoNome,
    horaInicio: document.getElementById("campoHoraInicio").value || null,
    horaFim: document.getElementById("campoHoraFim").value || null,
    feriasInicio: document.getElementById("campoFeriasInicio").value || null,
    feriasFim: document.getElementById("campoFeriasFim").value || null,
  };

  botaoSalvar.disabled = true;
  botaoSalvar.textContent = "Salvando...";
  let resposta;
  if (lancamentoEditandoId) {
    resposta = await editarLancamento(lancamentoEditandoId, dadosLanc);
  } else {
    resposta = await adicionarLancamento({ registroFuncionario: registroFunc, nomeFuncionario, ...dadosLanc });
  }
  botaoSalvar.disabled = false;
  botaoSalvar.textContent = textoOriginalBotao;

  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar o lançamento.", "erro"); return; }

  document.getElementById("modalLancamento").classList.remove("active");
  if (funcSelecionado) { renderModalLancamentos(); renderModalBanco(); }
  renderTabelaFuncionarios();
  renderLancamentosGestor();
  mostrarToast("Lançamento salvo.");
});

// ====================================================
// ABA LANÇAMENTOS (visão global)
// ====================================================
function renderLancamentosGestor() {
  const container = document.getElementById("listaLancamentosGestor");
  const todos = lerLancamentos().sort((a, b) => new Date(b.data) - new Date(a.data));

  if (todos.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">Nenhum lançamento registrado.</p>';
    return;
  }

  container.innerHTML = "";
  todos.forEach((l) => {
    const info = TIPOS_LANCAMENTO[l.tipo] || { rotulo: l.tipo, efeito: "neutro" };
    const item = document.createElement("div");
    item.className = "lancamento-item";
    item.innerHTML = `
      <div class="lancamento-info">
        <span class="lancamento-tipo tipo-${info.efeito}">${info.rotulo}</span>
        <div class="lancamento-descricao"><strong>${escaparHtml(l.nomeFuncionario)}</strong> — ${formatarDataBR(l.data)}${l.horaInicio && l.horaFim ? " (" + l.horaInicio + " às " + l.horaFim + ")" : ""}${l.feriasInicio && l.feriasFim ? " (férias: " + formatarDataBR(l.feriasInicio) + " a " + formatarDataBR(l.feriasFim) + ")" : ""} ${l.descricao ? "— " + escaparHtml(l.descricao) : ""} ${renderDocumentoLanc(l)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="lancamento-horas">${info.efeito === "credito" ? "+" : info.efeito === "debito" ? "-" : ""}${formatarHoras(Math.abs(l.horas))}</div>
        <div class="lancamento-acoes">
          <button class="btn-editar-mini" data-gl-edit="${l.id}">Editar</button>
          <button class="btn-excluir-mini" data-gl-del="${l.id}">Excluir</button>
        </div>
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll("[data-gl-edit]").forEach((btn) => {
    btn.addEventListener("click", () => { funcSelecionado = null; abrirModalLancamento(btn.dataset.glEdit); });
  });
  container.querySelectorAll("[data-gl-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir lançamento?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await excluirLancamento(btn.dataset.glDel);
      renderLancamentosGestor();
      renderTabelaFuncionarios();
    });
  });
}

document.getElementById("btnNovoLancamento").addEventListener("click", () => {
  funcSelecionado = null;
  abrirModalLancamento(null);
});

// ====================================================
// ABA JORNADAS
// ====================================================
function renderJornadas() {
  const termo = (document.getElementById("buscaJornada")?.value || "").trim().toLowerCase();
  const tbody = document.getElementById("tbodyJornadas");
  const funcionarios = listarFuncionarios().filter((f) =>
    termo === "" || f.nome.toLowerCase().includes(termo) || String(f.registro).includes(termo)
  );
  tbody.innerHTML = "";

  if (funcionarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:20px;">Nenhum funcionário encontrado.</td></tr>';
    return;
  }

  funcionarios.forEach((f) => {
    const jornada = getJornadaCompleta(f.registro);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escaparHtml(f.nome)}</td>
      <td>${escaparHtml(f.registro)}</td>
      <td><input type="time" id="entrada_${f.registro}" value="${escaparHtml(jornada.horaEntrada || "")}"
        style="padding:6px;border:1px solid #ccc;border-radius:6px;font-family:inherit;width:100px;" /></td>
      <td><input type="time" id="saida_${f.registro}" value="${escaparHtml(jornada.horaSaida || "")}"
        style="padding:6px;border:1px solid #ccc;border-radius:6px;font-family:inherit;width:100px;" /></td>
      <td><input type="time" id="almoco_inicio_${f.registro}" value="${escaparHtml(jornada.inicioAlmoco || "")}"
        style="padding:6px;border:1px solid #ccc;border-radius:6px;font-family:inherit;width:100px;" /></td>
      <td><input type="time" id="almoco_fim_${f.registro}" value="${escaparHtml(jornada.fimAlmoco || "")}"
        style="padding:6px;border:1px solid #ccc;border-radius:6px;font-family:inherit;width:100px;" /></td>
      <td id="jornadaCalc_${f.registro}" style="font-weight:700;color:rgb(196, 78, 0);">
        ${jornada.horasDia ? formatarHoras(jornada.horasDia) + "/dia" : "—"}
      </td>
      <td><button class="btn-editar-mini" data-salvar-jornada="${f.registro}">Salvar</button></td>
    `;
    tbody.appendChild(tr);

    const entradaEl = document.getElementById(`entrada_${f.registro}`);
    const saidaEl = document.getElementById(`saida_${f.registro}`);
    const almocoInicioEl = document.getElementById(`almoco_inicio_${f.registro}`);
    const almocoFimEl = document.getElementById(`almoco_fim_${f.registro}`);
    const calcEl = document.getElementById(`jornadaCalc_${f.registro}`);

    function atualizarCalc() {
      const e = entradaEl.value;
      const s = saidaEl.value;
      if (!e || !s) { calcEl.textContent = "—"; return; }
      const [he, me] = e.split(":").map(Number);
      const [hs, ms] = s.split(":").map(Number);
      let totalMin = (hs * 60 + ms) - (he * 60 + me);
      const ai = almocoInicioEl.value;
      const af = almocoFimEl.value;
      if (ai && af) {
        const [ha1, ma1] = ai.split(":").map(Number);
        const [ha2, ma2] = af.split(":").map(Number);
        const almoco = (ha2 * 60 + ma2) - (ha1 * 60 + ma1);
        if (almoco > 0) totalMin -= almoco;
      }
      calcEl.textContent = totalMin > 0 ? formatarHoras(totalMin / 60) + "/dia" : "Horário inválido";
    }

    entradaEl.addEventListener("change", atualizarCalc);
    saidaEl.addEventListener("change", atualizarCalc);
    almocoInicioEl.addEventListener("change", atualizarCalc);
    almocoFimEl.addEventListener("change", atualizarCalc);
  });

  tbody.querySelectorAll("[data-salvar-jornada]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reg = btn.dataset.salvarJornada;
      const entrada = document.getElementById(`entrada_${reg}`).value;
      const saida = document.getElementById(`saida_${reg}`).value;
      const almocoInicio = document.getElementById(`almoco_inicio_${reg}`).value;
      const almocoFim = document.getElementById(`almoco_fim_${reg}`).value;
      if (!entrada || !saida) { mostrarToast("Informe entrada e saída.", "erro"); return; }
      const resposta = await setJornadaFuncionario(reg, entrada, saida, almocoInicio, almocoFim);
      if (!resposta.ok) { mostrarToast(resposta.erro || "Não foi possível salvar a jornada.", "erro"); return; }
      document.getElementById(`jornadaCalc_${reg}`).textContent = formatarHoras(resposta.horasDia) + "/dia";
      mostrarToast("Jornada salva.");
      renderTabelaFuncionarios();
    });
  });
}

// Listener do filtro de busca na aba jornada
document.getElementById("buscaJornada").addEventListener("input", renderJornadas);
document.getElementById("btnLimparBuscaJornada").addEventListener("click", () => {
  document.getElementById("buscaJornada").value = "";
  renderJornadas();
});

// ====================================================
// ABA FERIADOS
// ====================================================
const NOMES_FERIADOS_PADRAO = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Consciência Negra",
  "12-25": "Natal",
};

function renderAbaFeriados() {
  Object.assign(NOMES_FERIADOS_PADRAO, lerNomesFeriadosNacionais() || {});
  const podeEditar = podeEditarFeriados();
  renderFeriadosNacionais(podeEditar);
  popularSelectFuncFeriado(podeEditar);

  // Mostra/oculta os controles de adicionar
  const addRows = document.querySelectorAll(".feriados-add-row");
  addRows.forEach((r) => r.style.display = podeEditar ? "flex" : "none");

  if (!podeEditar) {
    const aviso = document.getElementById("avisoSemPermissaoFeriados");
    if (aviso) aviso.style.display = "block";
  }
}

function renderFeriadosNacionais(podeEditar) {
  const lista = lerFeriadosNacionais();
  const container = document.getElementById("listaFeriadosNacionais");
  container.innerHTML = "";

  if (lista.length === 0) {
    container.innerHTML = '<p style="color:var(--texto-3);font-size:12px;padding:4px;">Nenhum feriado cadastrado.</p>';
    return;
  }

  lista.forEach((mmdd) => {
    const nome = NOMES_FERIADOS_PADRAO[mmdd] || "Feriado";
    const linha = document.createElement("div");
    linha.className = "feriado-item";
    linha.innerHTML = `
      <div class="feriado-item-info">
        <span class="feriado-mmdd">${mmdd}</span>
        <span class="feriado-nome">${nome}</span>
      </div>
      ${podeEditar ? `
        <div style="display:flex;gap:6px;">
          <button class="btn-editar-mini" data-edit-feriado="${mmdd}" title="Editar">Editar</button>
          <button class="btn-del-feriado" data-del-feriado="${mmdd}" title="Remover">&times;</button>
        </div>
      ` : ""}
    `;
    container.appendChild(linha);
  });

  if (podeEditar) {
    container.querySelectorAll("[data-edit-feriado]").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalEditarFeriadoNacional(btn.dataset.editFeriado));
    });
    container.querySelectorAll("[data-del-feriado]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await confirmarAcao("Remover este feriado?", "Valerá para todos os funcionários.");
        if (!ok) return;
        const nova = lista.filter((d) => d !== btn.dataset.delFeriado);
        await salvarFeriadosNacionais(nova);
        renderFeriadosNacionais(podeEditar);
      });
    });
  }
}

let _feriadoEditando = null;

function abrirModalEditarFeriadoNacional(mmdd) {
  _feriadoEditando = mmdd;
  document.getElementById("editFeriadoMmdd").value = mmdd;
  document.getElementById("editFeriadoNome").value = NOMES_FERIADOS_PADRAO[mmdd] || "";
  document.getElementById("modalEditarFeriado").classList.add("active");
}

// Delegation para modal de editar feriado (elementos sempre presentes no DOM)
document.addEventListener("click", async (e) => {
  if (e.target.id === "fecharModalEditarFeriado" || e.target.id === "cancelarEditarFeriado") {
    document.getElementById("modalEditarFeriado").classList.remove("active");
  }
  if (e.target.id === "salvarEditarFeriado") {
    const novoMmdd = document.getElementById("editFeriadoMmdd").value.trim();
    const novoNome = document.getElementById("editFeriadoNome").value.trim();
    if (!/^\d{2}-\d{2}$/.test(novoMmdd)) { mostrarToast("Formato inválido. Use MM-DD.", "erro"); return; }
    let lista = lerFeriadosNacionais();
    lista = lista.filter((d) => d !== _feriadoEditando);
    if (!lista.includes(novoMmdd)) lista.push(novoMmdd);
    lista.sort();
    await salvarFeriadosNacionais(lista);
    if (novoNome) NOMES_FERIADOS_PADRAO[novoMmdd] = novoNome;
    if (_feriadoEditando !== novoMmdd) delete NOMES_FERIADOS_PADRAO[_feriadoEditando];
    salvarNomesFeriadosNacionais({ ...NOMES_FERIADOS_PADRAO }); // antes o nome se perdia ao recarregar
    document.getElementById("modalEditarFeriado").classList.remove("active");
    renderFeriadosNacionais(podeEditarFeriados());
    mostrarToast("Feriado atualizado.");
  }
});

// Event delegation — funciona mesmo com elementos dentro de abas ocultas
document.addEventListener("click", async (e) => {
  // Adicionar feriado nacional
  if (e.target.id === "btnAdicionarFeriadoNacional") {
    const val = document.getElementById("novoFeriadoNacional").value.trim();
    if (!/^\d{2}-\d{2}$/.test(val)) { mostrarToast("Use o formato MM-DD (ex: 06-19)", "erro"); return; }
    const lista = lerFeriadosNacionais();
    if (lista.includes(val)) { mostrarToast("Feriado já cadastrado.", "erro"); return; }
    lista.push(val);
    lista.sort();
    await salvarFeriadosNacionais(lista);
    NOMES_FERIADOS_PADRAO[val] = document.getElementById("novoFeriadoNacionalNome").value.trim() || "Feriado";
    salvarNomesFeriadosNacionais({ ...NOMES_FERIADOS_PADRAO });
    document.getElementById("novoFeriadoNacional").value = "";
    document.getElementById("novoFeriadoNacionalNome").value = "";
    renderFeriadosNacionais(podeEditarFeriados());
    mostrarToast("Feriado adicionado.");
  }

  // Adicionar feriado por funcionário
  if (e.target.id === "btnAdicionarFeriadoFunc") {
    const reg = document.getElementById("selectFuncFeriado").value;
    const data = document.getElementById("novoFeriadoFunc").value;
    const fixo = document.getElementById("feriadoFuncFixo").checked;
    const paraTodos = document.getElementById("feriadoFuncTodos").checked;
    if ((!reg && !paraTodos) || !data) { mostrarToast("Selecione o funcionário e a data.", "erro"); return; }
    const valor = fixo ? data.slice(5) : data; // fixo guarda só "MM-DD" (vale todo ano)
    const alvos = paraTodos ? listarFuncionarios().map((f) => f.registro) : [reg];
    if (paraTodos) {
      const ok = await confirmarAcao(`Adicionar para ${alvos.length} funcionário(s)?`, fixo ? "Fixo: vale todo ano." : "Só nesta data.");
      if (!ok) return;
    }
    const botao = e.target;
    botao.disabled = true;
    let adicionados = 0, jaTinham = 0, falhas = 0;
    for (const r of alvos) {
      const lista = [...lerFeriadosFuncionario(r)];
      if (lista.includes(valor)) { jaTinham++; continue; }
      lista.push(valor);
      lista.sort();
      const resp = await salvarFeriadosFuncionario(r, lista);
      if (resp && resp.ok === false) { falhas++; continue; }
      adicionados++;
    }
    botao.disabled = false;
    document.getElementById("novoFeriadoFunc").value = "";
    document.getElementById("feriadoFuncFixo").checked = false;
    document.getElementById("feriadoFuncTodos").checked = false;
    renderFeriadosFuncionario(podeEditarFeriados());
    if (falhas) mostrarToast(`${falhas} não foram salvos (sem permissão ou sem conexão).`, "erro");
    else if (!adicionados) mostrarToast("Já estava cadastrado.", "erro");
    else mostrarToast(adicionados > 1 ? `Feriado adicionado para ${adicionados} funcionários.` : "Feriado adicionado." + (jaTinham ? ` (${jaTinham} já tinham)` : ""));
  }
});

function popularSelectFuncFeriado(podeEditar) {
  const select = document.getElementById("selectFuncFeriado");
  const funcionarios = listarFuncionarios();
  select.innerHTML = "";
  funcionarios.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.registro;
    opt.textContent = f.nome + " (" + f.registro + ")";
    select.appendChild(opt);
  });
  select.addEventListener("change", () => renderFeriadosFuncionario(podeEditar));
  renderFeriadosFuncionario(podeEditar);
}

function renderFeriadosFuncionario(podeEditar) {
  const reg = document.getElementById("selectFuncFeriado").value;
  if (!reg) return;
  const lista = lerFeriadosFuncionario(reg);
  const container = document.getElementById("listaFeriadosFuncionario");
  container.innerHTML = "";

  if (lista.length === 0) {
    container.innerHTML = '<p style="color:var(--texto-3);font-size:12px;padding:4px;">Nenhum feriado específico cadastrado.</p>';
    return;
  }

  // Fixos (todo ano) primeiro, depois os de data única
  const ordenada = [...lista].sort((a, b) => (ehFeriadoFixo(b) - ehFeriadoFixo(a)) || a.localeCompare(b));
  ordenada.forEach((data) => {
    const fixo = ehFeriadoFixo(data);
    const dataFormatada = fixo
      ? new Date("2000-" + data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
      : new Date(data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
    const linha = document.createElement("div");
    linha.className = "feriado-item";
    linha.innerHTML = `
      <span class="feriado-data-completa">${dataFormatada}${fixo ? '<span class="tag-fixo-feriado">🔁 todo ano</span>' : ""}</span>
      ${podeEditar ? `<button class="btn-del-feriado" data-del-func-feriado="${data}" title="Remover">&times;</button>` : ""}
    `;
    container.appendChild(linha);
  });

  if (podeEditar) {
    container.querySelectorAll("[data-del-func-feriado]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await confirmarAcao("Remover este feriado?", "");
        if (!ok) return;
        const nova = lista.filter((d) => d !== btn.dataset.delFuncFeriado);
        await salvarFeriadosFuncionario(reg, nova);
        renderFeriadosFuncionario(podeEditar);
      });
    });
  }
}

// ====================================================
// INICIALIZAÇÃO
// ====================================================
(async function iniciarPontosConsulta() {
  await Promise.all([sincronizarFuncionariosCache(), carregarDadosPontosCache()]);
  popularFiltrosConsulta();
  renderTabelaFuncionarios();
})();

// ====================================================
// PDF MENSAL DE PONTOS
// ====================================================
function gerarPdfMensalPontos(registroFuncionario, nomeFuncionario, secoes) {
  if (!secoes) {
    secoes = { dadosFuncionario:true, resumo:true, espelho:true,
               lancamentos:true, localizacao:true, assinatura:true };
  }

  const mes = parseInt(document.getElementById("modalFiltroMes").value);
  const ano = parseInt(document.getElementById("modalFiltroAno").value);
  const nomeMes = NOMES_MESES_PONTO[mes];
  const jornadaHoras = getJornadaFuncionario(registroFuncionario);
  const jornadaCompleta = getJornadaCompleta(registroFuncionario);
  const banco = calcularBancoHorasCompleto(registroFuncionario);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const ML = 40;
  const MR = 40;
  let y = 0;

  const LARANJA = [255, 106, 0];
  const ESCURO  = [30, 30, 30];
  const CINZA   = [245, 245, 245];
  const VERDE   = [28, 138, 75];
  const VERMELHO= [220, 20, 60];
  const AZUL    = [43, 108, 176];

  function novaSecao(titulo) {
    if (y > PH - 100) { doc.addPage(); y = 50; }
    doc.setFillColor(...LARANJA);
    doc.rect(ML, y, PW - ML - MR, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(titulo.toUpperCase(), ML + 6, y + 12);
    doc.setTextColor(0);
    y += 24;
  }

  function garantirEspaco(min) {
    if (y + min > PH - 50) { doc.addPage(); y = 50; }
  }

  function rodape(n) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.text(
      "FNX TECH — Extrato de Ponto — " + nomeFuncionario + " — " + nomeMes + "/" + ano + " — Pág. " + n,
      PW / 2, PH - 18, { align: "center" }
    );
    doc.setTextColor(0);
  }

  // ── CABEÇALHO
  doc.setFillColor(...ESCURO);
  doc.rect(0, 0, PW, 55, "F");
  doc.setFillColor(...LARANJA);
  doc.rect(0, 55, PW, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("EXTRATO DE PONTO MENSAL", ML, 30);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("FNX TECH", ML, 46);
  doc.setTextColor(0);
  y = 75;

  // ── DADOS DO FUNCIONÁRIO
  if (secoes.dadosFuncionario) {
    const dadosFunc = listarFuncionarios().find((u) => String(u.registro) === String(registroFuncionario)) || {};
    doc.autoTable({
      startY: y,
      body: [
        ["Funcionário", nomeFuncionario, "Registro", registroFuncionario],
        ["CPF", dadosFunc.cpf || "—", "Setor", dadosFunc.setor || "—"],
        ["Período", nomeMes + " / " + ano, "Gerado em", new Date().toLocaleDateString("pt-BR")],
      ],
      margin: { left: ML, right: MR },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: CINZA, cellWidth: 90 },
        1: { cellWidth: 160 },
        2: { fontStyle: "bold", fillColor: CINZA, cellWidth: 90 },
        3: { cellWidth: 160 },
      },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 16;

    novaSecao("Jornada Contratual");
    doc.autoTable({
      startY: y,
      body: [[
        jornadaCompleta.horaEntrada || "—",
        jornadaCompleta.horaSaida || "—",
        (jornadaCompleta.inicioAlmoco && jornadaCompleta.fimAlmoco)
          ? jornadaCompleta.inicioAlmoco + " às " + jornadaCompleta.fimAlmoco
          : "Flexível",
        formatarHoras(jornadaHoras) + "/dia",
      ]],
      head: [["Entrada", "Saída", "Intervalo Almoço", "Horas/Dia"]],
      margin: { left: ML, right: MR },
      styles: { fontSize: 9, halign: "center" },
      headStyles: { fillColor: ESCURO },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // ── RESUMO DO MÊS
  if (secoes.resumo) {
    const registrosMes = lerRegistros().filter((r) => {
      if (r.registroFuncionario !== registroFuncionario) return false;
      const d = new Date(r.dataHora);
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
    const lancamentosMes = getLancamentosFuncionario(registroFuncionario).filter((l) => {
      const d = new Date(l.data + "T00:00:00");
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
    const diasComBatida = [...new Set(registrosMes.map((r) => r.dataHora.slice(0, 10)))];
    let htMes = 0;
    let extrasFds = 0;
    diasComBatida.forEach((data) => {
      const b = registrosMes.filter((r) => r.dataHora.startsWith(data))
        .sort((a, bx) => new Date(a.dataHora) - new Date(bx.dataHora));
      const hd = calcularHorasTrabalhadasNoDia(b);
      if (ehFimDeSemana(data) || ehFeriado(data, registroFuncionario)) {
        extrasFds += hd;
      } else {
        htMes += hd;
      }
    });
    let extrasMes=0, faltasMes=0, abonosMes=0, atestadosMes=0, decMes=0, feriasMes=0, ajustesMes=0;
    lancamentosMes.forEach((l) => {
      if (l.tipo === "hora_extra") extrasMes += Math.abs(l.horas);
      else if (l.tipo === "falta") faltasMes += Math.abs(l.horas);
      else if (l.tipo === "abono") abonosMes += Math.abs(l.horas);
      else if (l.tipo === "atestado") atestadosMes += Math.abs(l.horas);
      else if (l.tipo === "declaracao") decMes += Math.abs(l.horas);
      else if (l.tipo === "ferias") feriasMes += Math.abs(l.horas);
      else if (l.tipo === "ajuste") ajustesMes += l.horas;
    });
    const heEsp = diasComBatida.filter((d) => ehDiaUtil(d, registroFuncionario)).length * jornadaHoras + faltasMes;
    const saldoMes = (htMes + extrasMes + abonosMes + atestadosMes + decMes + feriasMes + extrasFds)
                   - heEsp + (ajustesMes > 0 ? ajustesMes : 0) - (ajustesMes < 0 ? Math.abs(ajustesMes) : 0);

    novaSecao("Resumo do Mês");
    doc.autoTable({
      startY: y,
      body: [
        ["Dias com registro", String(diasComBatida.length), "Horas trabalhadas", formatarHoras(htMes)],
        ["Horas extras (fim de semana/feriado)", formatarHoras(extrasFds), "Horas extras lançadas", formatarHoras(extrasMes)],
        ["Faltas lançadas", formatarHoras(faltasMes), "Abonos", formatarHoras(abonosMes)],
        ["Atestados", formatarHoras(atestadosMes), "Férias", formatarHoras(feriasMes)],
        ["Declarações", formatarHoras(decMes), "Ajustes manuais", (ajustesMes>=0?"+":"") + formatarHoras(ajustesMes)],
        ["Horas esperadas", formatarHoras(heEsp), "SALDO DO MÊS", (saldoMes>=0?"+":"") + formatarHoras(saldoMes)],
      ],
      margin: { left: ML, right: MR },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle:"bold", fillColor:CINZA, cellWidth:185 },
        1: { cellWidth:75, halign:"right" },
        2: { fontStyle:"bold", fillColor:CINZA, cellWidth:185 },
        3: { cellWidth:75, halign:"right" },
      },
      didParseCell: (data) => {
        if (data.row.index === 5 && data.column.index === 3) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 11;
          data.cell.styles.textColor = saldoMes >= 0 ? VERDE : VERMELHO;
        }
      },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 16;

    novaSecao("Banco de Horas Acumulado");
    doc.autoTable({
      startY: y,
      body: [[
        formatarHoras(banco.horasTrabalhadas),
        formatarHoras(banco.horasEsperadas),
        String(banco.diasTrabalhados),
        (banco.saldo>=0?"+":"") + formatarHoras(banco.saldo),
      ]],
      head: [["Total Trabalhado","Total Esperado","Dias Trabalhados","Saldo Acumulado"]],
      margin: { left: ML, right: MR },
      styles: { fontSize: 10, halign:"center" },
      headStyles: { fillColor: ESCURO },
      didParseCell: (data) => {
        if (data.row.index === 0 && data.column.index === 3 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 12;
          data.cell.styles.textColor = banco.saldo >= 0 ? VERDE : VERMELHO;
        }
      },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 16;
    rodape(1);
  }

  // ── ESPELHO DE PONTO
  if (secoes.espelho) {
    doc.addPage(); y = 50;
    novaSecao("Espelho de Ponto — " + nomeMes + " / " + ano);

    const registrosMesEsp = lerRegistros().filter((r) => {
      if (r.registroFuncionario !== registroFuncionario) return false;
      const d = new Date(r.dataHora);
      return d.getMonth() === mes && d.getFullYear() === ano;
    });

    const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
    const todosDiasMes = diasDoMes(mes, ano);
    const hoje2 = new Date(); hoje2.setHours(23,59,59,0);
    const linhasDia = [];
    const coresPorLinha = [];
    let totalHMes = 0, totalSaldo = 0;

    todosDiasMes.forEach((data) => {
      const dataObj = new Date(data + "T12:00:00");
      const fds = ehFimDeSemana(data);
      const feriado = ehFeriado(data, registroFuncionario);
      const diaUtil = !fds && !feriado;
      const futuro = dataObj > hoje2;
      const batidasDia = registrosMesEsp
        .filter((r) => r.dataHora.startsWith(data))
        .sort((a,b) => new Date(a.dataHora)-new Date(b.dataHora));
      const hd = calcularHorasTrabalhadasNoDia(batidasDia);
      const temBatida = batidasDia.length > 0;
      let saldoDia = 0, corLinha = null, obs = "";

      if (fds || feriado) {
        obs = hd > 0 ? "Hora Extra" : (feriado ? "Feriado" : "Fim de Semana");
        corLinha = hd > 0 ? "extra" : "fds";
        saldoDia = hd;
      } else if (!temBatida && !futuro) {
        obs = "Falta"; corLinha = "falta"; saldoDia = -jornadaHoras;
      } else if (!temBatida && futuro) {
        obs = "—"; corLinha = "futuro"; saldoDia = 0;
      } else {
        saldoDia = hd - jornadaHoras;
        corLinha = saldoDia >= 0 ? "ok" : "parcial";
      }

      if (!futuro) {
        totalHMes += hd;
        totalSaldo += saldoDia;
      }

      const diaSemana = DIAS_SEMANA[dataObj.getDay()];
      const horarios = batidasDia.map((b) =>
        formatarHoraBR(b.dataHora) + (b.tipo==="entrada"?"E":"S")
      ).join("  ") || (futuro ? "" : obs);

      linhasDia.push([
        formatarDataBR(data), diaSemana, horarios,
        hd>0 ? formatarHoras(hd) : "—",
        diaUtil ? formatarHoras(jornadaHoras) : "—",
        futuro ? "—" : (saldoDia>=0?"+":"") + formatarHoras(saldoDia),
      ]);
      coresPorLinha.push(corLinha);
    });

    doc.autoTable({
      startY: y,
      head: [["Data","Dia","Registros","Trabalhado","Esperado","Saldo"]],
      body: linhasDia.length ? linhasDia : [["—","—","Sem registros","—","—","—"]],
      foot: [["TOTAL","","",formatarHoras(totalHMes),formatarHoras(todosDiasMes.filter(d=>ehDiaUtil(d,registroFuncionario)).length * jornadaHoras),(totalSaldo>=0?"+":"") + formatarHoras(totalSaldo)]],
      margin: { left: ML, right: MR },
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: LARANJA },
      footStyles: { fillColor: CINZA, fontStyle:"bold" },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 28, halign:"center" },
        2: { cellWidth: 230 },
        3: { cellWidth: 60, halign:"right" },
        4: { cellWidth: 60, halign:"right" },
        5: { cellWidth: 60, halign:"right" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const cor = coresPorLinha[data.row.index];
        if (cor === "fds" || cor === "feriado") {
          data.cell.styles.fillColor = [240,240,240];
          data.cell.styles.textColor = [150,150,150];
        } else if (cor === "falta") {
          data.cell.styles.fillColor = [255,235,235];
          if (data.column.index === 5) { data.cell.styles.textColor = VERMELHO; data.cell.styles.fontStyle = "bold"; }
        } else if (cor === "extra") {
          data.cell.styles.fillColor = [235,255,235];
          if (data.column.index === 5) { data.cell.styles.textColor = VERDE; data.cell.styles.fontStyle = "bold"; }
        } else if (cor === "ok" || cor === "parcial") {
          if (data.column.index === 5) {
            data.cell.styles.textColor = String(data.cell.raw || "").startsWith("+") ? VERDE : VERMELHO;
            data.cell.styles.fontStyle = "bold";
          }
        } else if (cor === "futuro") {
          data.cell.styles.textColor = [200,200,200];
        }
      },
      theme: "striped",
    });
    y = doc.lastAutoTable.finalY + 16;
    rodape(2);
  }

  // ── LANÇAMENTOS ESPECIAIS
  if (secoes.lancamentos) {
    const lancamentosMesL = getLancamentosFuncionario(registroFuncionario).filter((l) => {
      const d = new Date(l.data + "T00:00:00");
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
    if (lancamentosMesL.length > 0) {
      garantirEspaco(80);
      novaSecao("Lançamentos Especiais — " + nomeMes + " / " + ano);
      doc.autoTable({
        startY: y,
        head: [["Data","Tipo","Período","Horas","Efeito","Descrição","Documento"]],
        body: lancamentosMesL.map((l) => {
          const info = TIPOS_LANCAMENTO[l.tipo] || { rotulo: l.tipo, efeito:"neutro" };
          const periodo = l.horaInicio && l.horaFim ? l.horaInicio + " às " + l.horaFim : "—";
          return [
            formatarDataBR(l.data), info.rotulo, periodo,
            formatarHoras(Math.abs(l.horas)),
            info.efeito==="credito"?"Crédito":info.efeito==="debito"?"Débito":"Neutro",
            l.descricao || "—", l.documentoNome || "—",
          ];
        }),
        margin: { left: ML, right: MR },
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: ESCURO },
        columnStyles: {
          0:{cellWidth:50}, 1:{cellWidth:65}, 2:{cellWidth:70},
          3:{cellWidth:42,halign:"right"}, 4:{cellWidth:42},
          5:{cellWidth:145}, 6:{cellWidth:90},
        },
        didParseCell: (data) => {
          if (data.column.index === 4 && data.section === "body") {
            if (data.cell.raw === "Crédito") data.cell.styles.textColor = VERDE;
            else if (data.cell.raw === "Débito") data.cell.styles.textColor = VERMELHO;
            else data.cell.styles.textColor = AZUL;
            data.cell.styles.fontStyle = "bold";
          }
        },
        theme: "striped",
      });
      y = doc.lastAutoTable.finalY + 16;
    }
  }

  // ── LOCALIZAÇÃO
  if (secoes.localizacao) {
    const registrosMesLoc = lerRegistros().filter((r) => {
      if (r.registroFuncionario !== registroFuncionario) return false;
      const d = new Date(r.dataHora);
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
    const batidasComLoc = registrosMesLoc
      .filter((r) => r.lat || r.endereco)
      .sort((a,b) => new Date(a.dataHora)-new Date(b.dataHora));
    if (batidasComLoc.length > 0) {
      garantirEspaco(80);
      novaSecao("Registro de Localização");
      doc.autoTable({
        startY: y,
        head: [["Data","Hora","Tipo","Endereço","Coordenadas"]],
        body: batidasComLoc.map((b) => [
          formatarDataBR(b.dataHora.slice(0,10)),
          formatarHoraBR(b.dataHora),
          b.tipo==="entrada"?"Entrada":"Saída",
          b.endereco || "Não disponível",
          b.lat && b.lng ? b.lat.toFixed(5) + ", " + b.lng.toFixed(5) : "—",
        ]),
        margin: { left: ML, right: MR },
        styles: { fontSize: 8, overflow:"linebreak", cellPadding: 3 },
        headStyles: { fillColor: AZUL },
        columnStyles: {
          0:{cellWidth:55}, 1:{cellWidth:38}, 2:{cellWidth:40},
          3:{cellWidth:272}, 4:{cellWidth:107},
        },
        theme: "striped",
      });
      y = doc.lastAutoTable.finalY + 16;
    }
  }

  // ── ASSINATURAS
  if (secoes.assinatura) {
    garantirEspaco(100);
    if (y > PH - 140) { doc.addPage(); y = 50; }
    y += 20;
    const largAssin = (PW - ML - MR - 40) / 2;
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(ML, y+40, ML+largAssin, y+40);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(nomeFuncionario, ML+largAssin/2, y+52, {align:"center"});
    doc.text("Funcionário", ML+largAssin/2, y+63, {align:"center"});
    const xResp = ML+largAssin+40;
    doc.line(xResp, y+40, xResp+largAssin, y+40);
    doc.text("Responsável / Gestor", xResp+largAssin/2, y+52, {align:"center"});
    doc.text("FNX TECH Engenharia", xResp+largAssin/2, y+63, {align:"center"});
    y += 80;
    doc.setFontSize(7); doc.setTextColor(160);
    doc.text(
      "Documento gerado em " + new Date().toLocaleString("pt-BR") + " — Sistema FNX TECH — Dados extraídos do registro eletrônico de ponto",
      PW/2, y, {align:"center"}
    );
  }

  const nomeArquivo = "extrato_ponto_" + nomeFuncionario.replace(/\s+/g,"_").toLowerCase() + "_" + nomeMes + "_" + ano + ".pdf";
  doc.save(nomeArquivo);
}

const NOMES_MESES_PT = NOMES_MESES_PONTO;

// ====================================================
// EXTRATO POR PERÍODO — uma linha resumo por funcionário, no
// mesmo formato do relatório "Extrato por Período" do Control iD.
// ====================================================
function gerarExtratoPontoPDF(registroFuncionario, nomeFuncionario, mes, ano) {
  const nomeMes = NOMES_MESES_PONTO[mes];
  const dataIni = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const ultimoDia = diasDoMes(mes, ano).length;
  const dataFim = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  const r = calcularApuracaoPeriodo(registroFuncionario, dataIni, dataFim);
  const banco = calcularBancoHorasCompleto(registroFuncionario);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const ML = 40, MR = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text("Extrato", ML, 50);
  doc.text("por Período", ML, 78);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Emitido em " + new Date().toLocaleString("pt-BR"), PW - MR, 30, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(220, 20, 60);
  doc.text(`DE ${dataIni.split("-").reverse().join("/")} ATÉ ${dataFim.split("-").reverse().join("/")}`, PW - MR, 50, { align: "right" });
  doc.setTextColor(0);

  const fmt = (h) => {
    const neg = h < 0;
    const abs = Math.abs(h);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${neg ? "-" : ""}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  doc.autoTable({
    startY: 105,
    head: [["Nome do Funcionário", "Total\nNormais", "Total\nNoturno", "Dia\nFalta", "Falta e\nAtraso", "Abono", "Extra\nDiurna", "Extra\nNoturna", "Banco\nTotal", "Banco\nSaldo"]],
    body: [[
      nomeFuncionario,
      fmt(r.totalNormais), r.totalNoturno ? fmt(r.totalNoturno) : "",
      r.diaFalta ? fmt(r.diaFalta) : "", r.faltaEAtraso ? fmt(r.faltaEAtraso) : "",
      r.abono ? fmt(r.abono) : "", r.extraDiurna ? fmt(r.extraDiurna) : "", r.extraNoturna ? fmt(r.extraNoturna) : "",
      fmt(r.bancoTotal), fmt(banco.saldo),
    ]],
    foot: [["TOTAL: 1 FUNCIONÁRIO",
      fmt(r.totalNormais), r.totalNoturno ? fmt(r.totalNoturno) : "",
      r.diaFalta ? fmt(r.diaFalta) : "", r.faltaEAtraso ? fmt(r.faltaEAtraso) : "",
      r.abono ? fmt(r.abono) : "", r.extraDiurna ? fmt(r.extraDiurna) : "", r.extraNoturna ? fmt(r.extraNoturna) : "",
      fmt(r.bancoTotal), fmt(banco.saldo),
    ]],
    margin: { left: ML, right: MR },
    styles: { fontSize: 8.5, cellPadding: 5, halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    headStyles: { fillColor: 255, textColor: 30, fontStyle: "bold", fontSize: 7.5, lineWidth: 0.5, lineColor: 220 },
    footStyles: { fillColor: 255, textColor: 30, fontStyle: "bold", lineWidth: 0.5, lineColor: 220 },
    theme: "plain",
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(160);
  doc.text(
    "⚠ Relatório gerado pelo sistema FNX TECH — \"Falta e Atraso\" reflete apenas lançamentos manuais desse tipo (sem detecção automática de atraso por horário). Confira contra o Control iD antes de usar para fins de pagamento.",
    ML, doc.lastAutoTable.finalY + 20, { maxWidth: PW - ML - MR }
  );

  doc.save(`extrato_${nomeFuncionario.replace(/\s+/g, "_").toLowerCase()}_${nomeMes}_${ano}.pdf`);
}

// ====================================================
// APURAÇÃO DE PONTO — dia a dia, até 3 pares de entrada/saída por
// dia, no mesmo formato do relatório "Apuração de Ponto" do
// Control iD.
// ====================================================
function gerarApuracaoPontoPDF(registroFuncionario, nomeFuncionario, mes, ano) {
  const nomeMes = NOMES_MESES_PONTO[mes];
  const dataIni = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const ultimoDia = diasDoMes(mes, ano).length;
  const dataFim = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const r = calcularApuracaoPeriodo(registroFuncionario, dataIni, dataFim);

  // Saldo acumulado ANTES do período começar, pra dar contexto de
  // onde o "Banco Total" deste mês se encaixa no saldo geral —
  // sem isso, um "+02:00" no mês pareceria sempre bom, mesmo que a
  // pessoa já estivesse devendo 30h de meses anteriores.
  // (calcula "como se hoje fosse" o dia anterior ao período — antes
  // contava as horas esperadas até hoje e o saldo saía negativo demais)
  const diaAntesPeriodo = new Date(dataIni + "T12:00:00");
  diaAntesPeriodo.setDate(diaAntesPeriodo.getDate() - 1);
  const saldoAntes = calcularBancoHorasCompleto(registroFuncionario, diaAntesPeriodo.toISOString().slice(0, 10)).saldo;
  const saldoDepois = saldoAntes + r.bancoTotal;

  const fmt = (h) => {
    const neg = h < 0;
    const abs = Math.abs(h);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${neg ? "-" : ""}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const PW = doc.internal.pageSize.getWidth();
  const ML = 30, MR = 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text("Apuração de Ponto", ML, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${nomeFuncionario}  —  ${nomeMes} / ${ano}`, ML, 46);
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.text(`Saldo acumulado antes do período: ${fmt(saldoAntes)}   |   Saldo acumulado depois: ${fmt(saldoDepois)}`, ML, 58);
  doc.setTextColor(0);

  const corpo = r.linhasDia.map((linha) => {
    const dataObj = new Date(linha.data + "T12:00:00");
    const diaSemana = DIAS_SEMANA[dataObj.getDay()];
    const ents = linha.batidas.filter((b) => b.tipo === "entrada").map((b) => formatarHoraBR(b.dataHora));
    const sais = linha.batidas.filter((b) => b.tipo === "saida").map((b) => formatarHoraBR(b.dataHora));

    if (!linha.diaUtil && linha.batidas.length === 0) {
      return [linha.data.split("-").reverse().join("/"), diaSemana, "Folga", "Folga", "Folga", "Folga", "Folga", "Folga", "", "", "", "", "", "", "", ""];
    }

    const temAbono = linha.lancamentos.some((l) => (TIPOS_LANCAMENTO[l.tipo] || {}).efeito === "abono");
    const normalDia = linha.diaUtil ? Math.min(linha.horasDia, getJornadaFuncionario(registroFuncionario)) : 0;
    const extraDia = !linha.diaUtil ? linha.horasDia : Math.max(0, linha.horasDia - getJornadaFuncionario(registroFuncionario));
    const faltaDia = linha.diaUtil && linha.batidas.length === 0 && !temAbono ? getJornadaFuncionario(registroFuncionario) : 0;
    const abonoDia = linha.lancamentos.filter((l) => (TIPOS_LANCAMENTO[l.tipo] || {}).efeito === "abono").reduce((s, l) => s + Math.abs(l.horas || 0), 0);
    const faltaAtrasoDia = linha.lancamentos.filter((l) => l.tipo === "falta").reduce((s, l) => s + Math.abs(l.horas || 0), 0);

    return [
      linha.data.split("-").reverse().join("/"), diaSemana,
      ents[0] || "", sais[0] || "", ents[1] || "", sais[1] || "", ents[2] || "", sais[2] || "",
      normalDia ? fmt(normalDia) : "", "", faltaDia ? fmt(faltaDia) : "", faltaAtrasoDia ? fmt(faltaAtrasoDia) : "",
      abonoDia ? fmt(abonoDia) : "", extraDia ? fmt(extraDia) : "", "",
    ];
  });

  doc.autoTable({
    startY: 68,
    head: [["Dia", "", "Ent.1", "Saí.1", "Ent.2", "Saí.2", "Ent.3", "Saí.3", "Total\nNormais", "Total\nNoturno", "Dia\nFalta", "Falta e\nAtraso", "Abono", "Extra\nDiurna", "Extra\nNoturna"]],
    body: corpo,
    foot: [["Total", "", "", "", "", "", "", "",
      fmt(r.totalNormais), "", r.diaFalta ? fmt(r.diaFalta) : "", r.faltaEAtraso ? fmt(r.faltaEAtraso) : "",
      r.abono ? fmt(r.abono) : "", r.extraDiurna ? fmt(r.extraDiurna) : "", "",
    ]],
    margin: { left: ML, right: MR },
    styles: { fontSize: 7, cellPadding: 3, halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" }, 1: { halign: "center" } },
    headStyles: { fillColor: [255, 106, 0], textColor: 255, fontSize: 6.5 },
    footStyles: { fillColor: [245, 245, 245], textColor: 30, fontStyle: "bold" },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.raw[2] === "Folga") {
        data.cell.styles.textColor = [170, 170, 170];
      }
    },
    theme: "striped",
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(160);
  doc.text(
    "⚠ \"Falta e Atraso\" reflete apenas lançamentos manuais desse tipo. Confira contra o Control iD antes de usar para fins de pagamento.",
    ML, doc.lastAutoTable.finalY + 16
  );

  doc.save(`apuracao_${nomeFuncionario.replace(/\s+/g, "_").toLowerCase()}_${nomeMes}_${ano}.pdf`);
}

document.getElementById("btnExtratoPonto").addEventListener("click", () => {
  if (!funcSelecionado) return;
  const mes = parseInt(document.getElementById("modalFiltroMes").value);
  const ano = parseInt(document.getElementById("modalFiltroAno").value);
  gerarExtratoPontoPDF(funcSelecionado.registro, funcSelecionado.nome, mes, ano);
});
document.getElementById("btnApuracaoPonto").addEventListener("click", () => {
  if (!funcSelecionado) return;
  const mes = parseInt(document.getElementById("modalFiltroMes").value);
  const ano = parseInt(document.getElementById("modalFiltroAno").value);
  gerarApuracaoPontoPDF(funcSelecionado.registro, funcSelecionado.nome, mes, ano);
});