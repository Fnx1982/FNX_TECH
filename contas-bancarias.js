// ============================================================
// contas-bancarias.js — Gerenciamento de Contas (FNX DEV)
// Substitui as páginas fixas de banco: a empresa cadastra as
// contas que quiser (nome, banco, agência, conta, cor) e cada uma
// tem o seu extrato (o motor de extrato.js, que filtra os
// lançamentos pelo id da conta).
//
// As contas ficam no servidor em data-set "contasBancarias".
// A conta aberta vai na URL (?conta=ID) — trocar de conta recarrega
// a página, assim o extrato sempre começa limpo.
// ============================================================

(async function () {
  const CORES = ["#FF6A00", "#E5141B", "#111111", "#FFB000", "#1C8A4B", "#2B6CB0", "#7B3FE4", "#8A8A8A"];
  const gradeContas = document.getElementById("gradeContas");
  const vazioContas = document.getElementById("vazioContas");
  const areaExtrato = document.getElementById("areaExtrato");
  const tagContaAtual = document.getElementById("tagContaAtual");
  const saldoGeralEl = document.getElementById("saldoGeral");
  const modalConta = document.getElementById("modalConta");
  const formConta = document.getElementById("formConta");
  const coresContaEl = document.getElementById("coresConta");

  let contas = [];
  let lancamentos = [];
  let contaEditandoId = null;

  const moeda = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const toast = (msg, tipo) => (typeof mostrarToast === "function" ? mostrarToast(msg, tipo) : alert(msg));

  function saldoDaConta(id) {
    return lancamentos
      .filter((l) => l.banco === id)
      .reduce((s, l) => s + (l.tipo === "saida" ? -1 : 1) * (Number(l.valor) || 0), 0);
  }

  function contaDaUrl() {
    const id = new URLSearchParams(location.search).get("conta") || localStorage.getItem("fnxUltimaConta") || "";
    return contas.find((c) => c.id === id) || contas[0] || null;
  }

  function abrirConta(id) {
    localStorage.setItem("fnxUltimaConta", id);
    location.href = `contas-bancarias.html?conta=${encodeURIComponent(id)}`;
  }

  function renderContas(atual) {
    gradeContas.innerHTML = "";
    vazioContas.style.display = contas.length ? "none" : "block";
    let total = 0;
    contas.forEach((c) => {
      const saldo = saldoDaConta(c.id);
      total += saldo;
      const card = document.createElement("div");
      card.className = "conta-card" + (atual && atual.id === c.id ? " ativa" : "");
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      const dados = [c.codigoBanco && `Banco ${c.codigoBanco}`, c.agencia && `Ag. ${c.agencia}`, c.numero && `C/C ${c.numero}`].filter(Boolean).join(" · ");
      card.innerHTML = `
        <span class="faixa" style="background:${escaparHtml(c.cor || CORES[0])}"></span>
        <div class="acoes-conta">
          <button type="button" data-editar title="Editar conta" aria-label="Editar conta">✎</button>
          <button type="button" data-excluir title="Excluir conta" aria-label="Excluir conta">🗑</button>
        </div>
        <div class="nome">${escaparHtml(c.nome)}</div>
        <div class="dados">${escaparHtml(dados)}</div>
        <div class="saldo ${saldo < 0 ? "neg" : "pos"}">${moeda(saldo)}</div>`;
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-editar]")) { e.stopPropagation(); abrirModalConta(c); return; }
        if (e.target.closest("[data-excluir]")) { e.stopPropagation(); excluirConta(c); return; }
        if (!atual || atual.id !== c.id) abrirConta(c.id);
      });
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" && (!atual || atual.id !== c.id)) abrirConta(c.id); });
      gradeContas.appendChild(card);
    });
    const nova = document.createElement("button");
    nova.type = "button";
    nova.className = "conta-card conta-nova";
    nova.innerHTML = "<span style='font-size:22px'>+</span> Nova conta";
    nova.addEventListener("click", () => abrirModalConta(null));
    gradeContas.appendChild(nova);
    saldoGeralEl.innerHTML = contas.length ? `Saldo somado de todas as contas: <b style="color:${total < 0 ? "var(--fnx-vermelho)" : "#1c8a4b"}">${moeda(total)}</b>` : "";
  }

  // ── Modal de conta ────────────────────────────────────────
  function abrirModalConta(conta) {
    contaEditandoId = conta ? conta.id : null;
    document.getElementById("tituloModalConta").textContent = conta ? "Editar conta" : "Nova conta";
    document.getElementById("contaNome").value = conta ? conta.nome : "";
    document.getElementById("contaCodigo").value = conta ? conta.codigoBanco || "" : "";
    document.getElementById("contaAgencia").value = conta ? conta.agencia || "" : "";
    document.getElementById("contaNumero").value = conta ? conta.numero || "" : "";
    const corAtual = (conta && conta.cor) || CORES[contas.length % CORES.length];
    coresContaEl.innerHTML = CORES.map((cor) => `
      <label title="${cor}"><input type="radio" name="corConta" value="${cor}" ${cor === corAtual ? "checked" : ""} /><span style="background:${cor}"></span></label>`).join("");
    modalConta.classList.add("active");
    setTimeout(() => document.getElementById("contaNome").focus(), 50);
  }
  const fecharModalConta = () => modalConta.classList.remove("active");
  document.getElementById("fecharModalConta").addEventListener("click", fecharModalConta);
  modalConta.addEventListener("click", (e) => { if (e.target === modalConta) fecharModalConta(); });

  async function lerContasServidor() {
    const r = await apiDataGet("contasBancarias");
    return r.ok && Array.isArray(r.valor) ? r.valor : [];
  }

  // Mantém os "Dados da conta" do extrato (OFX/CNAB240) iguais aos da conta.
  async function sincronizarDadosContaExtrato(conta) {
    const r = await apiDataGet("extratoConfig");
    const cfg = (r.ok && r.valor) ? r.valor : {};
    cfg[conta.id] = cfg[conta.id] || { classificacoes: [], dadosConta: {} };
    cfg[conta.id].dadosConta = { banco: conta.codigoBanco || "", agencia: conta.agencia || "", conta: conta.numero || "" };
    await apiDataSet("extratoConfig", cfg);
  }

  formConta.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("contaNome").value.trim();
    if (!nome) return;
    const botao = document.getElementById("btnSalvarConta");
    botao.disabled = true;
    botao.textContent = "Salvando...";
    try {
      const atuais = await lerContasServidor(); // relê pra não apagar conta criada por outra pessoa
      if (atuais.some((c) => c.nome.trim().toLowerCase() === nome.toLowerCase() && c.id !== contaEditandoId)) {
        toast("Já existe uma conta com esse nome.", "erro");
        return;
      }
      const dados = {
        nome,
        codigoBanco: document.getElementById("contaCodigo").value.trim(),
        agencia: document.getElementById("contaAgencia").value.trim(),
        numero: document.getElementById("contaNumero").value.trim(),
        cor: (formConta.querySelector("input[name=corConta]:checked") || {}).value || CORES[0],
      };
      let conta;
      if (contaEditandoId) {
        const idx = atuais.findIndex((c) => c.id === contaEditandoId);
        if (idx === -1) { toast("Essa conta não existe mais.", "erro"); return; }
        conta = atuais[idx] = { ...atuais[idx], ...dados };
      } else {
        conta = { id: "conta_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), criadoEm: new Date().toISOString(), ...dados };
        atuais.push(conta);
      }
      const r = await apiDataSet("contasBancarias", atuais);
      if (!r.ok) { toast(r.erro || "Não foi possível salvar a conta.", "erro"); return; }
      await sincronizarDadosContaExtrato(conta);
      fecharModalConta();
      toast("Conta salva.");
      abrirConta(conta.id);
    } finally {
      botao.disabled = false;
      botao.textContent = "Salvar conta";
    }
  });

  async function excluirConta(conta) {
    const dela = lancamentos.filter((l) => l.banco === conta.id);
    const ok = await confirmarAcao(
      `Excluir a conta "${conta.nome}"?`,
      dela.length ? `Os ${dela.length} lançamento(s) do extrato dela também serão apagados. Não dá para desfazer.` : "Não dá para desfazer."
    );
    if (!ok) return;
    for (const l of dela) await apiExcluirLancamentoExtrato(l.id);
    const atuais = (await lerContasServidor()).filter((c) => c.id !== conta.id);
    const r = await apiDataSet("contasBancarias", atuais);
    if (!r.ok) { toast(r.erro || "Não foi possível excluir.", "erro"); return; }
    if (localStorage.getItem("fnxUltimaConta") === conta.id) localStorage.removeItem("fnxUltimaConta");
    toast("Conta excluída.");
    location.href = "contas-bancarias.html";
  }

  // ── Início ──────────────────────────────────────────────
  const [rContas, rLanc] = await Promise.all([apiDataGet("contasBancarias"), apiListarLancamentosExtrato()]);
  contas = rContas.ok && Array.isArray(rContas.valor) ? rContas.valor : [];
  lancamentos = rLanc.ok ? rLanc.lancamentos || [] : [];
  const atual = contaDaUrl();
  renderContas(atual);

  if (!atual) return; // sem contas: só mostra o "+ Nova conta"
  tagContaAtual.textContent = atual.nome;
  document.title = `FNX DEV — ${atual.nome}`;
  areaExtrato.hidden = false;

  // Atualiza os saldos dos cartões sempre que o extrato mudar
  document.addEventListener("extrato-atualizado", (e) => {
    lancamentos = e.detail.lancamentos || lancamentos;
    renderContas(atual);
  });

  window.EXTRATO_CONFIG = {
    nomeBanco: atual.id,          // os lançamentos guardam o id da conta
    rotuloBanco: atual.nome,      // nome mostrado nos PDFs/planilhas
    codigoBancoPadrao: atual.codigoBanco || "",
  };
  const s = document.createElement("script");
  s.src = "extrato.js?v=fnx1";
  document.body.appendChild(s);
})();
