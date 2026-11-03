// ============================================================
// pontos-confirmacao.js
// Tela do funcionário: bate ponto, vê batidas do dia,
// histórico do mês e lançamentos especiais próprios.
// ============================================================

// auth-guard.js já garantiu que existe uma sessão válida e já
// sincronizou nome/registro/tipo em localStorage antes deste script
// rodar — não é mais necessário procurar numa lista local de
// usuários (que agora vive no servidor, não no navegador).
const userId = localStorage.getItem("userId");
const nomeUsuario = localStorage.getItem("userNome") || "Usuário";
const registroUsuario = userId;

document.getElementById("nomeUsuarioLogado").textContent = `Olá, ${nomeUsuario}`;

// ====================================================
// RELÓGIO
// ====================================================
function atualizarRelogio() {
  const agora = new Date();
  document.getElementById("relogioDisplay").textContent =
    agora.toLocaleTimeString("pt-BR");
  document.getElementById("dataDisplay").textContent =
    agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
atualizarRelogio();
setInterval(atualizarRelogio, 1000);

// ====================================================
// BATER PONTO
// ====================================================
document.getElementById("btnBaterPonto").addEventListener("click", async () => {
  const confirmado = await confirmarAcao(
    "Registrar ponto agora?",
    `${new Date().toLocaleTimeString("pt-BR")} — ${new Date().toLocaleDateString("pt-BR")}`
  );
  if (!confirmado) return;

  // Desabilita o botão enquanto captura localização (pode demorar até 8s)
  const btn = document.getElementById("btnBaterPonto");
  btn.disabled = true;
  btn.textContent = "Aguardando localização...";

  try {
    const resposta = await baterPonto(registroUsuario, nomeUsuario);
    if (!resposta.ok) { mostrarToast(resposta.erro || "Não foi possível registrar o ponto.", "erro"); return; }

    const batida = resposta.batida;
    const localTexto = batida.endereco ? ` — 📍 ${batida.endereco}` : "";
    mostrarToast(`Ponto registrado: ${batida.tipo === "entrada" ? "Entrada" : "Saída"} às ${formatarHoraBR(batida.dataHora)}${localTexto}`);
    renderTudo();
  } finally {
    // "finally" garante que o botão nunca fica travado, mesmo se
    // algo inesperado (erro de rede, etc.) acontecer no meio do caminho.
    btn.disabled = false;
    btn.textContent = "Registrar Ponto";
  }
});

// ====================================================
// BANCO DE HORAS
// ====================================================
function renderBancoHoras() {
  const banco = calcularBancoHorasCompleto(registroUsuario);
  document.getElementById("cardJornada").textContent = formatarHoras(banco.jornada);
  document.getElementById("cardTrabalhadas").textContent = formatarHoras(banco.horasTrabalhadas);
  document.getElementById("cardDias").textContent = banco.diasTrabalhados;

  const saldoEl = document.getElementById("cardSaldo");
  saldoEl.textContent = formatarHoras(banco.saldo);
  saldoEl.className = "valor " + (banco.saldo >= 0 ? "positivo" : "negativo");
}

// ====================================================
// BATIDAS DE HOJE
// ====================================================
function renderBatidasHoje() {
  const container = document.getElementById("listaBatidasHoje");
  const batidas = getBatidasFuncionarioData(registroUsuario, dataHoje());

  if (batidas.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">Nenhuma batida registrada hoje.</p>';
    atualizarProximaBatida([]);
    return;
  }

  container.innerHTML = "";
  batidas.forEach((b, i) => {
    const chip = document.createElement("div");
    chip.className = "chip-batida";
    const linkMaps = b.lat ? `<a href="https://www.google.com/maps?q=${b.lat},${b.lng}" target="_blank" style="font-size:11px;color:#2b6cb0;text-decoration:none;">📍 ${escaparHtml(b.endereco) || "Ver no mapa"}</a>` : "";
    chip.innerHTML = `
      <span class="numero">#${i + 1}</span>
      <span class="horario">${formatarHoraBR(b.dataHora)}</span>
      <span class="tipo-batida tipo-${b.tipo}">${b.tipo === "entrada" ? "Entrada" : "Saída"}</span>
      ${linkMaps}
      ${b.obs ? `<span style="font-size:12px;color:#888;">${b.obs}</span>` : ""}
    `;
    container.appendChild(chip);
  });

  atualizarProximaBatida(batidas);
}

function atualizarProximaBatida(batidas) {
  const el = document.getElementById("proximaBatidaTexto");
  if (batidas.length === 0) {
    el.textContent = "Próximo registro: Entrada";
    return;
  }
  const ultima = batidas[batidas.length - 1];
  el.textContent = `Próximo registro: ${ultima.tipo === "entrada" ? "Saída" : "Entrada"}`;
}

// ====================================================
// HISTÓRICO DO MÊS
// ====================================================
function popularFiltrosMesPonto() {
  const mesEl = document.getElementById("filtroMesPonto");
  const anoEl = document.getElementById("filtroAnoPonto");

  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();

  mesEl.innerHTML = "";
  NOMES_MESES_PONTO.forEach((nome, i) => {
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

  mesEl.addEventListener("change", renderHistoricoMes);
  anoEl.addEventListener("change", renderHistoricoMes);
}

function renderHistoricoMes() {
  const mes = parseInt(document.getElementById("filtroMesPonto").value);
  const ano = parseInt(document.getElementById("filtroAnoPonto").value);
  const container = document.getElementById("historicoMes");

  const registros = lerRegistros().filter((r) => {
    if (r.registroFuncionario !== registroUsuario) return false;
    const d = new Date(r.dataHora);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });

  const datasPorDia = [...new Set(registros.map((r) => r.dataHora.slice(0, 10)))].sort((a, b) => b.localeCompare(a));

  if (datasPorDia.length === 0) {
    container.innerHTML = '<p style="color:var(--texto-3);font-size:13px;padding:4px;">Nenhum registro neste mês.</p>';
    return;
  }

  const jornada = getJornadaFuncionario(registroUsuario);
  container.innerHTML = "";

  datasPorDia.forEach((data) => {
    const batidasDia = registros
      .filter((r) => r.dataHora.startsWith(data))
      .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));

    const horasDia = calcularHorasTrabalhadasNoDia(batidasDia);
    const saldoDia = horasDia - jornada;
    const classeSeloSaldo = saldoDia > 0 ? "positivo" : saldoDia < 0 ? "negativo" : "neutro";

    const div = document.createElement("div");
    div.className = "dia-card";
    div.innerHTML = `
      <div class="dia-card-topo">
        <strong style="font-size:13px;">${formatarDataBR(data)}</strong>
        <span class="selo-saldo ${classeSeloSaldo}">
          ${formatarHoras(horasDia)} ${saldoDia >= 0 ? "+" : ""}${formatarHoras(saldoDia)}
        </span>
      </div>
      <div class="dia-card-chips">
        ${batidasDia.map((b) => `
          <span class="chip-batida" style="padding:6px 10px;">
            <span class="tipo-batida tipo-${b.tipo}">${b.tipo === "entrada" ? "E" : "S"}</span>
            <span class="horario">${formatarHoraBR(b.dataHora)}</span>
            ${b.endereco ? `<a href="https://www.google.com/maps?q=${b.lat},${b.lng}" target="_blank" style="font-size:11px;color:var(--azul);text-decoration:none;">📍</a>` : ""}
          </span>
        `).join("")}
      </div>
    `;
    container.appendChild(div);
  });
}

// ====================================================
// LANÇAMENTOS ESPECIAIS
// ====================================================
function renderLancamentos() {
  const container = document.getElementById("listaLancamentos");
  const lancamentos = getLancamentosFuncionario(registroUsuario);

  if (lancamentos.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">Nenhum lançamento registrado.</p>';
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
        <div class="lancamento-descricao">${formatarDataBR(l.data)} ${l.descricao ? "— " + escaparHtml(l.descricao) : ""} ${l.documento ? '<span style="color:#2b6cb0;font-size:12px;">📄 ' + escaparHtml(l.documento) + '</span>' : ""}</div>
      </div>
      <div class="lancamento-horas" style="color:${info.efeito === "credito" ? "#1c8a4b" : info.efeito === "debito" ? "crimson" : "#2b6cb0"};">
        ${info.efeito === "credito" ? "+" : info.efeito === "debito" ? "-" : ""}${formatarHoras(Math.abs(l.horas))}
      </div>
    `;
    container.appendChild(item);
  });
}

// ====================================================
// INICIALIZAÇÃO
// ====================================================
function renderTudo() {
  renderBancoHoras();
  renderBatidasHoje();
  renderHistoricoMes();
  renderLancamentos();
}

(async function iniciarPontosConfirmacao() {
  await Promise.all([carregarDadosPontosCache(), garantirTokenDownload()]);
  popularFiltrosMesPonto();
  renderTudo();
})();