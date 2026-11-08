// ============================================================
// avisos-agenda.js — avisos de prazo da Agenda (Google Agenda)
// Usado na tela inicial e na Agenda, depois de google-auth.js e
// notificacoes.js.
//
// 1) No sino: lista os pagamentos, entregas e levantamentos dos
//    próximos 7 dias. Os que vencem em até 48h contam no número
//    vermelho do sino.
// 2) Com o sistema aberto: na hora de cada aviso do evento (os que
//    foram escolhidos em "Avisar antes"), aparece um aviso na tela e,
//    se a pessoa permitir, uma notificação do navegador.
// Com o sistema fechado quem avisa é o próprio Google Agenda (app no
// celular / e-mail), porque os avisos ficam salvos no evento.
// ============================================================
(function () {
  const DIAS_A_FRENTE = 7;
  const TIPOS_PRAZO = ["pagamento", "entrega", "visita"];
  const ICONE = { pagamento: "💳", entrega: "📦", visita: "📍", outro: "📅" };
  const COR = { pagamento: "#D64545", entrega: "#1C8A4B", visita: "#FF6A00", outro: "#4A7BD0" };
  // Evento sem avisos próprios: usa estes (minutos antes), igual ao formulário
  const PADRAO = { visita: [1440, 60], pagamento: [4320, 1440, 0], entrega: [10080, 2880, 1440], outro: [30] };
  const CHAVE_VISTOS = "fnxAvisosAgendaVistos"; // só marca o que já foi mostrado neste navegador

  let eventos = [];

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tipoDe = (ev) => (typeof tipoEventoEnjob === "function" ? tipoEventoEnjob(ev) : "outro");
  const inicioDe = (ev) => new Date(ev.start.dateTime || ev.start.date + "T09:00");

  function lerVistos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_VISTOS) || "{}"); } catch (e) { return {}; }
  }
  function marcarVisto(chave) {
    try {
      const v = lerVistos();
      v[chave] = Date.now();
      // limpa marcas com mais de 30 dias
      for (const k of Object.keys(v)) if (Date.now() - v[k] > 30 * 864e5) delete v[k];
      localStorage.setItem(CHAVE_VISTOS, JSON.stringify(v));
    } catch (e) { /* navegador sem armazenamento: só não lembra */ }
  }

  function minutosDeAviso(ev) {
    const r = ev.reminders;
    if (r && r.useDefault === false && Array.isArray(r.overrides) && r.overrides.length) {
      return [...new Set(r.overrides.map((o) => Number(o.minutes) || 0))];
    }
    if (r && r.useDefault === false) return []; // pediram explicitamente sem aviso
    return PADRAO[tipoDe(ev)] || PADRAO.outro;
  }

  function quandoTexto(data) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dia = new Date(data); dia.setHours(0, 0, 0, 0);
    const dif = Math.round((dia - hoje) / 864e5);
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (dif < 0) return "atrasado";
    if (dif === 0) return `hoje, ${hora}`;
    if (dif === 1) return `amanhã, ${hora}`;
    return `${data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}, ${hora}`;
  }

  function prazos() {
    const agora = Date.now();
    return eventos
      .filter((ev) => TIPOS_PRAZO.includes(tipoDe(ev)))
      .filter((ev) => inicioDe(ev).getTime() >= agora - 60 * 60 * 1000)
      .sort((a, b) => inicioDe(a) - inicioDe(b));
  }

  // ----- Sino -----
  window.fnxRenderAvisosAgenda = function (container) {
    const lista = prazos();
    const pedirPermissao = "Notification" in window && Notification.permission === "default";
    if (!lista.length && !pedirPermissao) return false;
    const bloco = document.createElement("div");
    bloco.style.cssText = "margin:0 0 6px; padding:6px 4px 8px; border-bottom:1px solid #eee;";
    bloco.innerHTML = `<div style="font-size:11px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:.04em; padding:2px 6px 6px;">Agenda — próximos ${DIAS_A_FRENTE} dias</div>` +
      (lista.length ? "" : `<div style="font-size:12px; color:#999; padding:4px 6px;">Nenhum pagamento, entrega ou levantamento.</div>`) +
      lista.slice(0, 8).map((ev) => {
        const tipo = tipoDe(ev);
        const quando = inicioDe(ev);
        const urgente = quando.getTime() - Date.now() < 48 * 3600e3;
        return `<a href="calendario.html" style="display:flex; gap:8px; align-items:flex-start; text-decoration:none; padding:7px 8px; border-radius:8px; border-left:3px solid ${COR[tipo]}; margin:3px 2px; background:${urgente ? "#FFF5F0" : "#fafafa"};">
          <span style="font-size:15px; line-height:1.2;">${ICONE[tipo]}</span>
          <span style="flex:1; min-width:0;">
            <span style="display:block; font-size:12.5px; color:#222; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(ev.summary || "(sem título)")}</span>
            <span style="display:block; font-size:11px; color:${urgente ? "#C2410C" : "#888"}; font-weight:${urgente ? 700 : 500};">${esc(quandoTexto(quando))}</span>
          </span>
        </a>`;
      }).join("") +
      (pedirPermissao ? `<button type="button" id="btnPermitirAvisos" style="margin:6px 6px 0; background:none; border:none; color:#FF6A00; font-weight:700; font-size:11.5px; cursor:pointer; padding:0;">🔔 Receber avisos também no navegador</button>` : "");
    container.appendChild(bloco);
    const btn = bloco.querySelector("#btnPermitirAvisos");
    if (btn) btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await Notification.requestPermission(); } catch (err) { /* navegador antigo */ }
      if (typeof carregarNotificacoes === "function") carregarNotificacoes();
    });
    return true;
  };

  function atualizarContagem() {
    const limite = Date.now() + 48 * 3600e3;
    window.fnxQtdAvisosAgenda = prazos().filter((ev) => inicioDe(ev).getTime() <= limite).length;
    if (typeof carregarNotificacoes === "function") carregarNotificacoes();
  }

  // ----- Aviso na tela + notificação do navegador -----
  function mostrarAviso(ev, minutos) {
    const tipo = tipoDe(ev);
    const quando = inicioDe(ev);
    const titulo = `${ICONE[tipo]} ${ev.summary || "Evento"}`;
    const texto = minutos === 0 ? "Começa agora." : `${quandoTexto(quando).replace(/^./, (c) => c.toUpperCase())}.`;

    let caixa = document.getElementById("avisosAgendaTela");
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.id = "avisosAgendaTela";
      caixa.setAttribute("role", "status");
      caixa.style.cssText = "position:fixed; right:16px; bottom:16px; z-index:6500; display:flex; flex-direction:column; gap:8px; max-width:min(360px, calc(100vw - 32px)); font-family:'Montserrat',sans-serif;";
      document.body.appendChild(caixa);
    }
    const card = document.createElement("div");
    card.style.cssText = `background:#16161A; color:#fff; border-radius:14px; padding:12px 38px 12px 14px; border-left:4px solid ${COR[tipo]}; box-shadow:0 12px 32px rgba(0,0,0,.35); position:relative;`;
    card.innerHTML = `<div style="font-size:11px; font-weight:700; color:#ff9a55; text-transform:uppercase; letter-spacing:.04em;">Aviso da agenda</div>
      <div style="font-size:14px; font-weight:700; margin-top:3px;">${esc(titulo)}</div>
      <div style="font-size:12.5px; color:#c9c9d0; margin-top:2px;">${esc(texto)}</div>
      <a href="calendario.html" style="display:inline-block; margin-top:6px; font-size:12px; color:#ff9a55; font-weight:700;">Abrir agenda →</a>
      <button type="button" aria-label="Fechar" style="position:absolute; top:8px; right:10px; background:none; border:none; color:#aaa; font-size:18px; cursor:pointer;">&times;</button>`;
    card.querySelector("button").addEventListener("click", () => card.remove());
    caixa.appendChild(card);
    setTimeout(() => card.remove(), 60 * 1000);

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification(titulo, { body: texto, tag: `${ev.id}|${minutos}`, icon: "favicon.svg" });
        n.onclick = () => { window.focus(); location.href = "calendario.html"; };
      } catch (e) { /* alguns celulares só aceitam via service worker */ }
    }
  }

  function conferirAvisos() {
    const agora = Date.now();
    const vistos = lerVistos();
    eventos.forEach((ev) => {
      const inicio = inicioDe(ev).getTime();
      if (inicio < agora - 15 * 60 * 1000) return; // já passou
      minutosDeAviso(ev).forEach((min) => {
        const horaDoAviso = inicio - min * 60 * 1000;
        const chave = `${ev.id}|${ev.start.dateTime || ev.start.date}|${min}`;
        // dispara se já chegou a hora e não faz mais de 1h que chegou (não despeja avisos velhos)
        if (agora >= horaDoAviso && agora - horaDoAviso < 60 * 60 * 1000 && !vistos[chave]) {
          marcarVisto(chave);
          mostrarAviso(ev, min);
        }
      });
    });
  }

  async function buscarEventos() {
    if (typeof isGoogleAuthenticated !== "function" || !isGoogleAuthenticated()) {
      eventos = [];
      atualizarContagem();
      return;
    }
    try {
      const agora = new Date();
      const resp = await gapi.client.calendar.events.list({
        calendarId: "primary",
        timeMin: new Date(agora.getTime() - 60 * 60 * 1000).toISOString(),
        timeMax: new Date(agora.getTime() + DIAS_A_FRENTE * 864e5).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100,
      });
      eventos = resp.result.items || [];
      atualizarContagem();
      conferirAvisos();
    } catch (e) {
      console.warn("[avisos-agenda] Não foi possível ler a agenda:", e);
    }
  }
  window.fnxAtualizarAvisosAgenda = buscarEventos;

  if (typeof onGoogleAuthChange === "function") onGoogleAuthChange(buscarEventos);
  setInterval(conferirAvisos, 60 * 1000);       // confere a hora dos avisos a cada minuto
  setInterval(buscarEventos, 10 * 60 * 1000);   // relê a agenda a cada 10 minutos
})();
