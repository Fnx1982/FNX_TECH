// ===== calendario.js =====
// A autenticação com o Google agora é centralizada em google-auth.js.
// Este arquivo cuida apenas do calendário visual (FullCalendar) e
// das chamadas de criar/editar/excluir eventos.

let calendar;
let eventoSelecionado = null;

// Mostra "Conectado como fulano@gmail.com" + Trocar conta/Desconectar,
// ou só o botão "Conectar com Google".
function showLoginButton(show) {
  const conectado = !show;
  document.getElementById("btnLogin").style.display = conectado ? "none" : "inline-block";
  document.getElementById("btnTrocarConta").style.display = conectado ? "inline-block" : "none";
  document.getElementById("btnLogout").style.display = conectado ? "inline-block" : "none";
  document.getElementById("btnNovoEvento").style.display = conectado ? "block" : "none";
  const status = document.getElementById("statusGoogle");
  if (conectado) {
    status.innerHTML = `Conectado como <b>${escaparHtml(getGoogleEmailSalvo() || "sua conta Google")}</b>`;
  } else {
    const aviso = (typeof googleAvisoConexao !== "undefined" && googleAvisoConexao) ? `<br><small>${escaparHtml(googleAvisoConexao)}</small>` : "";
    status.innerHTML = `Conecte seu Gmail uma vez — depois fica conectado.${aviso}`;
  }
}

// Celular: tela estreita usa uma barra de botões menor e a opção "Lista"
function ehTelaPequena() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function mostrarAvisoErroGoogle() {
  if (document.getElementById("avisoErroGoogle")) return; // já mostrado, não duplica
  const aviso = document.createElement("div");
  aviso.id = "avisoErroGoogle";
  aviso.style.cssText = "background:#FDECEA; color:#8A1C1C; border:1px solid #F5C2C0; border-radius:8px; padding:12px 16px; margin-bottom:16px; font-size:13.5px; line-height:1.5;";
  // Mostra o motivo real (antes era sempre a mesma mensagem genérica)
  const semConfig = !(typeof GOOGLE_CLIENT_ID !== "undefined" && GOOGLE_CLIENT_ID);
  const e = typeof googleApiErroInicializacao !== "undefined" ? googleApiErroInicializacao : null;
  let detalhe = "";
  if (e) {
    detalhe = (e.result && e.result.error && e.result.error.message) || e.details || e.error || e.message || "";
    if (typeof detalhe !== "string") { try { detalhe = JSON.stringify(detalhe); } catch (x) { detalhe = String(detalhe); } }
  }
  aviso.innerHTML = semConfig
    ? "<b>O Google Agenda ainda não está configurado.</b> Preencha <code>FNX_GOOGLE_CLIENT_ID</code> no arquivo <code>config.js</code> do site."
    : "<b>Não foi possível conectar com o Google Agenda.</b> Se a chave da API acabou de ser criada ou restringida, o Google pode levar alguns minutos para liberar." +
      (detalhe ? `<br><small>Motivo informado pelo Google: ${escaparHtml(detalhe)}</small>` : "");
  const container = document.querySelector(".container") || document.body;
  container.insertBefore(aviso, container.firstChild);
}

function iniciarTelaCalendario() {
  // Atualiza botões de login/logout conforme estado atual.
  // Essa função pode rodar mais de uma vez (ex: token atrasado
  // chegando depois do fallback), por isso é segura para repetir.
  const autenticado = isGoogleAuthenticated();
  showLoginButton(!autenticado);

  // Se a inicialização da API do Google falhou (ex: chave bloqueada,
  // sem internet), mostra isso na tela em vez de deixar a pessoa
  // achando que o sistema simplesmente não faz nada.
  if (typeof googleApiErroInicializacao !== "undefined" && googleApiErroInicializacao) {
    mostrarAvisoErroGoogle();
  }

  if (autenticado) {
    listarEventos();
  }

  // Conectar e Trocar conta abrem a janela do Google (só nesses cliques)
  const aposConectar = () => { showLoginButton(false); listarEventos(); };
  document.getElementById("btnLogin").onclick = () => googleLoginInterativo(aposConectar);
  document.getElementById("btnTrocarConta").onclick = () => googleLoginInterativo(aposConectar);

  document.getElementById("btnLogout").onclick = async () => {
    if (!confirm("Desconectar o Gmail do calendário?")) return;
    await googleLogout(() => {
      showLoginButton(true);
      if (calendar) calendar.removeAllEvents();
    });
  };

  // Botão "+ Novo evento" — no celular é mais fácil que tocar no dia
  document.getElementById("btnNovoEvento").onclick = () => {
    const hoje = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    abrirModalNovo(`${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`);
  };

  // Inicializa o calendário visual (uma única vez)
  if (!calendar) {
    const calendarEl = document.getElementById("calendar");
    const celular = ehTelaPequena();
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      locale: "pt-br",
      height: "auto",
      headerToolbar: celular
        ? { left: "prev,next", center: "title", right: "today" }
        : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth" },
      footerToolbar: celular ? { center: "dayGridMonth,listMonth" } : false,
      buttonText: { today: "Hoje", month: "Mês", week: "Semana", day: "Dia", list: "Lista" },
      dayMaxEventRows: celular ? 2 : false,
      // Tocar num dia abre "Novo evento" já com a data
      dateClick: (info) => {
        if (!isGoogleAuthenticated()) { alert("Conecte seu Gmail primeiro (botão acima)."); return; }
        abrirModalNovo(info.dateStr.slice(0, 10));
      },
      eventClick: (info) => abrirModalEditar(info.event),
      events: [],
    });
    calendar.render();
  }
}

// ===== Funções para manipular eventos =====

function listarEventos() {
  if (!isGoogleAuthenticated()) return;

  gapi.client.calendar.events
    .list({
      calendarId: "primary",
      timeMin: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      timeMax: new Date(new Date().getFullYear() + 1, 0, 1).toISOString(),
      showDeleted: false,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 200,
    })
    .then((response) => {
      const eventos = response.result.items || [];

      const CORES_TIPO = { visita: "#FF6A00", pagamento: "#D64545", entrega: "#1C8A4B", outro: "#4A7BD0" };
      const ICONE_TIPO = { visita: "📍", pagamento: "💳", entrega: "📦", outro: "" };
      const eventosFormatados = eventos.map((ev) => {
        const priv = ev.extendedProperties?.private || {};
        const clientePagamento = priv.clientePagamento || "";
        const tipo = tipoEventoEnjob(ev);
        // Eventos novos já têm o nome no título ("Visita — Ed. X");
        // nos antigos mostra "Cliente: Título" como antes.
        const tituloBase = priv.enjobTipo ? (ev.summary || "") : (clientePagamento ? `${clientePagamento}: ${ev.summary || ""}` : (ev.summary || ""));
        return {
          id: ev.id,
          title: `${ICONE_TIPO[tipo] ? ICONE_TIPO[tipo] + " " : ""}${tituloBase}`,
          start: ev.start.dateTime || ev.start.date,
          end: ev.end?.dateTime || ev.end?.date,
          backgroundColor: CORES_TIPO[tipo],
          borderColor: CORES_TIPO[tipo],
          extendedProps: {
            tituloOriginal: ev.summary || "",
            location: ev.location || "",
            description: ev.description || "",
            clientePagamento,
            tipo,
            privado: priv,
            reminders: ev.reminders || null,
          },
        };
      });

      calendar.removeAllEvents();
      calendar.addEventSource(eventosFormatados);
      if (typeof window.fnxAtualizarAvisosAgenda === "function") window.fnxAtualizarAvisosAgenda();
    })
    .catch((err) => {
      console.error("Erro ao buscar eventos:", err);
    });
}

// Explica o erro do Google em português, em vez de só "Erro".
function mensagemErroGoogle(err) {
  const status = err && (err.status || (err.result && err.result.error && err.result.error.code));
  if (status === 401) return " A conexão com o Google expirou — recarregue a página ou use \"Trocar conta\".";
  if (status === 403) return " Essa conta Google não tem permissão na agenda.";
  return "";
}

// Botões Maps/Waze embaixo do campo Endereço do evento
function atualizarMapaEvento() {
  const el = document.getElementById("mapaEvento");
  if (el && typeof htmlLinksMapa === "function") el.innerHTML = htmlLinksMapa(document.getElementById("eventEndereco").value);
}
document.getElementById("eventEndereco").addEventListener("input", atualizarMapaEvento);

// ===== Tipo do evento =====
const DICAS_TIPO_EVENTO = {
  visita: "Aparece em Levantamento de Requisitos → \"Agendadas no calendário\", com a empresa, o contato e o endereço já prontos.",
  pagamento: "Conta, boleto ou mensalidade a pagar. Só a empresa e a data.",
  entrega: "Entrega, prazo ou go-live de um projeto.",
  outro: "Compromisso comum.",
};
// Avisos sugeridos por tipo (minutos antes). Dá para mudar no formulário.
const LEMBRETES_PADRAO = {
  visita: [1440, 60],
  pagamento: [4320, 1440, 0],
  entrega: [10080, 2880, 1440],
  outro: [30],
};
function marcarLembretes(minutos, email) {
  document.querySelectorAll("#chipsLembrete input").forEach((c) => { c.checked = minutos.includes(Number(c.value)); });
  document.getElementById("lembreteEmail").checked = !!email;
}
function lerLembretes() {
  const minutos = [...document.querySelectorAll("#chipsLembrete input:checked")].map((c) => Number(c.value)).sort((a, b) => b - a);
  return { minutos, email: document.getElementById("lembreteEmail").checked };
}
document.getElementById("chipsLembrete").addEventListener("change", (e) => {
  const marcados = document.querySelectorAll("#chipsLembrete input:checked");
  if (marcados.length > 4 && document.getElementById("lembreteEmail").checked) {
    e.target.checked = false;
    alert("O Google aceita até 5 avisos por evento (o e-mail conta como 1).");
  } else if (marcados.length > 5) {
    e.target.checked = false;
    alert("O Google aceita até 5 avisos por evento.");
  }
});
document.getElementById("lembreteEmail").addEventListener("change", (e) => {
  if (e.target.checked && document.querySelectorAll("#chipsLembrete input:checked").length > 4) {
    e.target.checked = false;
    alert("Desmarque um aviso para incluir o e-mail (máximo de 5 por evento).");
  }
});
function tipoSelecionadoEvento() {
  const r = document.querySelector('input[name="tipoEvento"]:checked');
  return r ? r.value : "visita";
}
function aplicarTipoEvento(tipo) {
  const radio = document.querySelector(`input[name="tipoEvento"][value="${tipo}"]`);
  if (radio) radio.checked = true;
  document.querySelectorAll("#eventModal .so-tipo").forEach((el) => {
    el.classList.toggle("escondido", !el.dataset.tipos.split(" ").includes(tipo));
  });
  document.getElementById("dicaTipoEvento").textContent = DICAS_TIPO_EVENTO[tipo] || "";
  const rot = document.getElementById("rotuloDescricaoEvento");
  rot.textContent = tipo === "visita" ? "O que precisa ser visto no levantamento" : tipo === "pagamento" ? "Observação (opcional)" : tipo === "entrega" ? "O que será entregue" : "Descritivo / Observação";
  document.getElementById("rotuloTituloEvento").textContent = tipo === "entrega" ? "Entrega" : "Título do evento";
  document.getElementById("eventTitle").placeholder = tipo === "entrega" ? "Ex: Versão 1.0, publicação na loja, go-live..." : "Ex: Reunião, apresentação...";
}
document.querySelectorAll('input[name="tipoEvento"]').forEach((r) => r.addEventListener("change", () => {
  const tipo = tipoSelecionadoEvento();
  aplicarTipoEvento(tipo);
  // evento novo: troca os avisos para o padrão do tipo
  if (!eventoSelecionado) marcarLembretes(LEMBRETES_PADRAO[tipo] || [], tipo === "pagamento");
}));

// Lê o formulário e monta o evento do Google
function montarEventoDoFormulario() {
  const tipo = tipoSelecionadoEvento();
  const v = (id) => document.getElementById(id).value.trim();
  const start = v("eventStart"), end = v("eventEnd");
  let titulo = v("eventTitle");
  const localNome = v("eventLocalNome"), clienteVisita = v("eventClienteVisita"), telefone = v("eventTelefone");
  const empresa = v("eventClientePagamento");
  const clienteEntrega = v("eventClienteEntrega");
  if (tipo === "entrega") {
    if (!titulo) return { erro: "Informe o que será entregue." };
    titulo = `Entrega — ${titulo}${clienteEntrega ? " (" + clienteEntrega + ")" : ""}`;
  } else if (tipo === "visita") {
    if (!localNome && !clienteVisita) return { erro: "Informe o nome do local ou o cliente do levantamento." };
    titulo = `Levantamento — ${localNome || clienteVisita}`;
  } else if (tipo === "pagamento") {
    if (!empresa) return { erro: "Informe a empresa do pagamento." };
    titulo = `Pagamento — ${empresa}`;
  } else if (!titulo) {
    return { erro: "Informe o título do evento." };
  }
  if (!start || !end) return { erro: "Preencha o início e o fim." };
  if (new Date(end) < new Date(start)) return { erro: "O fim está antes do início." };
  const privado = { enjobTipo: tipo };
  if (tipo === "visita") { privado.localNome = localNome; privado.clienteVisita = clienteVisita; privado.telefone = telefone; privado.clientePagamento = clienteVisita || localNome; }
  if (tipo === "pagamento") privado.clientePagamento = empresa;
  if (tipo === "entrega") { privado.clienteEntrega = clienteEntrega; privado.tituloEntrega = v("eventTitle"); }
  const lemb = lerLembretes();
  const overrides = lemb.minutos.slice(0, lemb.email ? 4 : 5).map((m) => ({ method: "popup", minutes: m }));
  if (lemb.email) overrides.push({ method: "email", minutes: lemb.minutos.length ? lemb.minutos[0] : 1440 });
  return {
    evento: {
      summary: titulo,
      location: tipo === "pagamento" ? "" : v("eventEndereco"),
      description: v("eventDescricao"),
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      // cor no Google Agenda: visita amarela, pagamento vermelha
      colorId: tipo === "visita" ? "6" : tipo === "pagamento" ? "11" : tipo === "entrega" ? "10" : undefined,
      extendedProperties: { private: privado },
      reminders: overrides.length ? { useDefault: false, overrides } : { useDefault: false, overrides: [] },
    },
  };
}

function limparCamposEvento() {
  ["eventTitle", "eventClientePagamento", "eventEndereco", "eventDescricao", "eventLocalNome", "eventClienteVisita", "eventTelefone", "eventClienteEntrega"]
    .forEach((id) => { document.getElementById(id).value = ""; });
}

function abrirModalNovo(data) {
  eventoSelecionado = null;
  limparCamposEvento();
  aplicarTipoEvento("visita");
  marcarLembretes(LEMBRETES_PADRAO.visita, false);
  atualizarMapaEvento();
  document.getElementById("eventStart").value = data + "T09:00";
  document.getElementById("eventEnd").value = data + "T10:00";
  document.querySelector("#eventModal h3").textContent = "Novo Evento";
  document.getElementById("btnSalvar").style.display = "block";
  document.getElementById("btnEditar").style.display = "none";
  document.getElementById("btnExcluir").style.display = "none";
  document.getElementById("eventModal").style.display = "flex";
}

function abrirModalEditar(event) {
  eventoSelecionado = event;
  limparCamposEvento();
  const ep = event.extendedProps || {};
  const priv = ep.privado || {};
  const tipo = ep.tipo || "outro";
  aplicarTipoEvento(tipo);
  document.getElementById("eventTitle").value = ep.tituloOriginal ?? event.title;
  if (tipo === "visita") {
    // evento antigo sem os campos novos: usa o "cliente" antigo como local
    document.getElementById("eventLocalNome").value = priv.localNome || (!priv.enjobTipo ? (ep.clientePagamento || ep.tituloOriginal || "") : "");
    document.getElementById("eventClienteVisita").value = priv.clienteVisita || "";
    document.getElementById("eventTelefone").value = priv.telefone || "";
  }
  if (tipo === "pagamento") document.getElementById("eventClientePagamento").value = ep.clientePagamento || ep.tituloOriginal || "";
  if (tipo === "entrega") {
    document.getElementById("eventTitle").value = priv.tituloEntrega || (ep.tituloOriginal || "").replace(/^Entrega — /, "");
    document.getElementById("eventClienteEntrega").value = priv.clienteEntrega || "";
  }
  // avisos que o evento já tem no Google
  const rem = ep.reminders;
  if (rem && rem.useDefault === false && Array.isArray(rem.overrides)) {
    marcarLembretes(rem.overrides.filter((o) => o.method === "popup").map((o) => o.minutes), rem.overrides.some((o) => o.method === "email"));
  } else {
    marcarLembretes(rem && rem.useDefault ? [30] : [], false);
  }
  document.getElementById("eventEndereco").value = ep.location || "";
  atualizarMapaEvento();
  document.getElementById("eventDescricao").value = ep.description || "";
  document.getElementById("eventStart").value = event.startStr.slice(0, 16);
  document.getElementById("eventEnd").value = event.endStr ? event.endStr.slice(0, 16) : "";
  document.querySelector("#eventModal h3").textContent = "Editar Evento";
  document.getElementById("btnSalvar").style.display = "none";
  document.getElementById("btnEditar").style.display = "block";
  document.getElementById("btnExcluir").style.display = "block";
  document.getElementById("eventModal").style.display = "flex";
}

function fecharModal() {
  document.getElementById("eventModal").style.display = "none";
}

function salvarEvento() {
  const r = montarEventoDoFormulario();
  if (r.erro) { alert(r.erro); return; }
  gapi.client.calendar.events
    .insert({ calendarId: "primary", resource: r.evento })
    .then(() => { fecharModal(); listarEventos(); })
    .catch((err) => {
      console.error("Erro ao criar evento:", err);
      alert("Erro ao criar evento." + mensagemErroGoogle(err));
    });
}

function editarEvento() {
  if (!eventoSelecionado) return;
  const r = montarEventoDoFormulario();
  if (r.erro) { alert(r.erro); return; }
  gapi.client.calendar.events
    .update({ calendarId: "primary", eventId: eventoSelecionado.id, resource: r.evento })
    .then(() => { fecharModal(); listarEventos(); })
    .catch((err) => {
      console.error("Erro ao editar evento:", err);
      alert("Erro ao editar evento." + mensagemErroGoogle(err));
    });
}

function excluirEvento() {
  if (!eventoSelecionado) return;

  gapi.client.calendar.events
    .delete({
      calendarId: "primary",
      eventId: eventoSelecionado.id,
    })
    .then(() => {
      fecharModal();
      listarEventos();
    })
    .catch((err) => {
      console.error("Erro ao excluir evento:", err);
      alert("Erro ao excluir evento." + mensagemErroGoogle(err));
    });
}