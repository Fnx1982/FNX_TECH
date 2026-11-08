// ============================================================
// notificacoes.js — sino de notificação, reutilizável em qualquer
// página que carregue auth-worker.js antes deste arquivo.
//
// Cria o próprio HTML/CSS na hora (não precisa editar cada página
// manualmente) e busca notificações periodicamente.
// ============================================================

const INTERVALO_ATUALIZACAO_NOTIFICACOES = 30000; // 30s

function montarSinoNotificacao() {
  if (document.getElementById("sinoNotificacao")) return;

  const container = document.createElement("div");
  container.id = "sinoNotificacao";
  container.style.cssText = "position:fixed; top:16px; right:16px; z-index:2000; font-family:'Montserrat',sans-serif;";
  container.innerHTML = `
    <button id="btnSinoNotificacao" style="position:relative; background:#fff; border:1px solid #e8e8e8; border-radius:50%; width:44px; height:44px; font-size:20px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.12);">
      🔔
      <span id="badgeNotificacao" style="display:none; position:absolute; top:-4px; right:-4px; background:#E5141B; color:#fff; font-size:10px; font-weight:700; border-radius:100px; min-width:16px; height:16px; padding:0 4px; align-items:center; justify-content:center; line-height:16px;"></span>
    </button>
    <div id="painelNotificacoes" style="display:none; position:absolute; top:52px; right:0; width:320px; max-height:420px; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.18); padding:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px;">
        <b style="font-size:13px;">Notificações</b>
        <button id="btnMarcarTodasLidas" style="background:none; border:none; color:#FF6A00; font-size:11.5px; font-weight:600; cursor:pointer;">Marcar todas como lidas</button>
      </div>
      <div id="listaNotificacoesPainel"></div>
      <div id="semNotificacoes" style="display:none; text-align:center; padding:24px; color:#999; font-size:12.5px;">Nenhuma notificação.</div>
    </div>
  `;
  document.body.appendChild(container);

  document.getElementById("btnSinoNotificacao").addEventListener("click", () => {
    const painel = document.getElementById("painelNotificacoes");
    const abrindo = painel.style.display === "none";
    painel.style.display = abrindo ? "block" : "none";
    if (abrindo) carregarNotificacoes();
  });

  document.getElementById("btnMarcarTodasLidas").addEventListener("click", async (e) => {
    e.stopPropagation();
    await apiMarcarTodasNotificacoesLidas();
    carregarNotificacoes();
  });

  // Fecha o painel se clicar fora
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      document.getElementById("painelNotificacoes").style.display = "none";
    }
  });
}

function formatarTempoRelativo(timestamp) {
  const diffMs = Date.now() - timestamp;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

async function carregarNotificacoes() {
  const resposta = await apiListarNotificacoes();
  if (!resposta.ok) return; // silencioso — não quero um toast de erro toda vez que o poll falha

  const naoLidas = resposta.notificacoes.filter((n) => !n.lida);
  // + prazos da agenda que vencem nas próximas 48h (avisos-agenda.js)
  const qtdAgenda = Number(window.fnxQtdAvisosAgenda || 0);
  const totalBadge = naoLidas.length + qtdAgenda;
  const badge = document.getElementById("badgeNotificacao");
  if (totalBadge > 0) {
    badge.textContent = totalBadge > 9 ? "9+" : totalBadge;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }

  const lista = document.getElementById("listaNotificacoesPainel");
  const vazio = document.getElementById("semNotificacoes");
  lista.innerHTML = "";
  const temAgenda = typeof window.fnxRenderAvisosAgenda === "function" && window.fnxRenderAvisosAgenda(lista);

  if (resposta.notificacoes.length === 0) { vazio.style.display = temAgenda ? "none" : "block"; return; }
  vazio.style.display = "none";

  resposta.notificacoes.slice(0, 30).forEach((n) => {
    const item = document.createElement("div");
    item.style.cssText = `position:relative; padding:10px ${n.podeExcluir ? "30px" : "10px"} 10px 10px; border-radius:8px; margin-bottom:4px; cursor:pointer; background:${n.lida ? "transparent" : "#FFF1E6"};`;
    // Aviso de demanda concluída: pede pra quem solicitou conferir.
    const complemento = n.tipo === "demanda-concluida"
      ? `<div style="font-size:11.5px; color:#1C8A4B; font-weight:600; margin-top:3px;">✓ Feito — confira se ficou tudo certo.</div>`
      : "";
    item.innerHTML = `
      <div style="font-size:12.5px; color:#333; line-height:1.4;">${escaparHtml(n.mensagem)}</div>
      ${complemento}
      <div style="font-size:10.5px; color:#999; margin-top:3px;">${formatarTempoRelativo(n.criadoEm)}</div>
      ${n.podeExcluir ? `<button type="button" class="btn-excluir-notificacao" title="Apagar notificação"
        style="position:absolute; top:6px; right:6px; background:none; border:none; color:#999; font-size:18px; line-height:1; cursor:pointer; padding:2px 6px; border-radius:50%;">&times;</button>` : ""}
    `;
    // X só aparece em notificação de demanda já concluída — o Worker
    // decide isso (campo podeExcluir) e confere de novo ao apagar.
    const btnExcluir = item.querySelector(".btn-excluir-notificacao");
    if (btnExcluir) {
      btnExcluir.addEventListener("mouseenter", () => { btnExcluir.style.color = "#E5141B"; });
      btnExcluir.addEventListener("mouseleave", () => { btnExcluir.style.color = "#999"; });
      btnExcluir.addEventListener("click", async (e) => {
        e.stopPropagation(); // não abre a obra
        item.style.opacity = "0.4";
        const resp = await apiExcluirNotificacao(n.id);
        if (!resp.ok && typeof mostrarToast === "function") mostrarToast(resp.erro || "Não foi possível apagar.", "erro");
        carregarNotificacoes();
      });
    }
    item.addEventListener("click", async () => {
      if (!n.lida) { await apiMarcarNotificacaoLida(n.id); carregarNotificacoes(); }
      if (n.sugestaoId) {
        // Aviso de sugestão: abre a janela de sugestões (na tela inicial)
        const aba = n.tipo === "nova-sugestao" ? "ti" : "minhas";
        if (typeof window.abrirPainelSugestoes === "function") {
          document.getElementById("painelNotificacoes").style.display = "none";
          window.abrirPainelSugestoes(aba);
        } else {
          window.location.href = `home.html?sugestoes=${aba}`;
        }
        return;
      }
      if (n.quadroId) { window.location.href = `quadros.html?quadro=${encodeURIComponent(n.quadroId)}${n.cartaoId ? `&cartao=${encodeURIComponent(n.cartaoId)}` : ""}`; return; }
      if (n.obraId) window.location.href = `obra-detalhe.html?id=${encodeURIComponent(n.obraId)}`;
    });
    lista.appendChild(item);
  });
}

montarSinoNotificacao();
carregarNotificacoes();
setInterval(carregarNotificacoes, INTERVALO_ATUALIZACAO_NOTIFICACOES);