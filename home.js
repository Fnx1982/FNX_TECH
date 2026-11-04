// ==========================
// MODAL DE LOGOUT
// ==========================
const logoutLink = document.getElementById("logout-link");
const modal = document.getElementById("logout-modal");
const btnYes = document.getElementById("btn-yes");
const btnNo = document.getElementById("btn-no");

async function logout() {
  try {
    // Invalida o token no servidor e limpa os dados de sessão locais.
    // "usuarios" não existe mais no localStorage (agora vive no
    // servidor), então não há mais risco de apagar a base de cadastros
    // ao sair.
    await apiLogout();

    localStorage.removeItem("montante");
    localStorage.removeItem("observacao");
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("userType");
    localStorage.removeItem("userNome");
    localStorage.removeItem("userSetor");

    window.location.href = "login.html";
  } catch (err) {
    console.error("Erro ao deslogar:", err);
    // Mesmo se a chamada ao servidor falhar (ex: sem internet),
    // ainda assim tira a sessão local para não travar o usuário.
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("userType");
    localStorage.removeItem("userNome");
    localStorage.removeItem("userSetor");
    window.location.href = "login.html";
  }
}


if (logoutLink && modal) {
  logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    modal.classList.add("active");
  });

  btnYes.addEventListener("click", () => {
    logout(); // chama função do api.js
    modal.classList.remove("active");
  });

  btnNo.addEventListener("click", () => modal.classList.remove("active"));

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      modal.classList.remove("active");
    }
  });
}

// ==========================
// SUBMENU
// ==========================
function setupSubmenuToggle(menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const toggle = menu.querySelector(".submenu-toggle");
  const submenu = menu.querySelector(".submenu");
  const arrow = menu.querySelector(".submenu-arrow");

  // Proteção extra: se o item não tiver mais um .submenu-toggle
  // (ex: virou um link direto, sem submenu), não tenta configurar
  // o clique — isso travava o script inteiro antes desta correção.
  if (!toggle) return;

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    if (!submenu) return;
    if (submenu.style.display === "block") {
      submenu.style.display = "none";
      if (arrow) arrow.style.transform = "rotate(0deg)";
    } else {
      submenu.style.display = "block";
      if (arrow) arrow.style.transform = "rotate(180deg)";
    }
  });

  menu.addEventListener("mouseleave", () => {
    // No celular não existe "tirar o mouse" de verdade — o navegador
    // simula esse evento no toque e fechava o submenu na mesma hora.
    if (window.matchMedia("(max-width: 768px), (hover: none) and (max-width: 1100px)").matches) return;
    if (submenu) submenu.style.display = "none";
    if (arrow) arrow.style.transform = "rotate(0deg)";
  });
}

[
  "financeiro-menu",
  "notas-menu",
  "propostas-menu",
  "midias-menu",
  "pontos-menu",
  "extrato-menu"
].forEach(setupSubmenuToggle);

// ==========================
// MENU POR USUÁRIO (permissão definida pelo SETOR do usuário)
// ==========================
// A lista de itens de menu e o mapa de permissões por setor vêm
// do arquivo permissoes-setor.js (compartilhado com a tela de
// Cadastro, onde cada setor é configurado).

// Dentro do submenu de Pontos, se o setor não tiver liberado o
// item de "Consulta" individualmente (algo que pode ser refinado
// depois), mostramos os dois sub-itens normalmente — a tela de
// Cadastro hoje configura "pontos-menu" como bloco único.
function aplicarRegraPontosSubitens() {
  const itemConfirmacao = document.getElementById("pontos-confirmacao-item");
  const itemConsulta = document.getElementById("pontos-consulta-item");
  if (!itemConfirmacao || !itemConsulta) return;
  itemConfirmacao.style.display = "";
  itemConsulta.style.display = "";
}

async function updateMenuVisibility() {
  const userId = localStorage.getItem("userId");
  // O setor vem da sessão validada pelo servidor (auth-guard.js já
  // sincronizou isso em localStorage["userSetor"] ao confirmar o
  // token). Antes isso vinha de localStorage["usuarios"], que só
  // existia no navegador onde o usuário foi cadastrado — por isso o
  // menu "sumia" ou saía errado em outro computador.
  const nomeSetor = localStorage.getItem("userSetor") || "";

  // Garante que o cache local de permissões está atualizado antes de
  // decidir o que mostrar no menu.
  await sincronizarDadosCompartilhados();

  // CEO/login fixo do sistema (ver login.js) não tem um setor
  // cadastrado de verdade — esse caso continua liberando tudo. E
  // qualquer pessoa do setor "Diretoria" também tem acesso total,
  // sem precisar configurar cada permissão manualmente.
  const userType = (localStorage.getItem("userType") || "").toLowerCase();
  const ehLoginFixo = userType === "ceo" || ehSetorAdministradorLocal(nomeSetor);

  const idsPermitidos = ehLoginFixo ? "todos" : getPermissoesDoSetor(nomeSetor);

  if (!ehLoginFixo && idsPermitidos.length === 0) {
    // Setor sem nenhuma permissão configurada ainda (ex: setor
    // recém-criado). Em vez de esconder tudo silenciosamente,
    // libera tudo e avisa no console.
    console.warn(`[home.js] Setor "${nomeSetor}" não tem permissões configuradas. Liberando todos os itens do menu.`);
  }

  const liberarTudo = idsPermitidos === "todos" || (!ehLoginFixo && idsPermitidos.length === 0);

  ITENS_MENU_DISPONIVEIS.forEach((item) => {
    const el = document.getElementById(item.id);
    if (!el) return;
    const permitido = liberarTudo || (Array.isArray(idsPermitidos) && idsPermitidos.includes(item.id));
    el.style.display = permitido ? "" : "none";
  });

  aplicarRegraPontosSubitens();

  const pontosConfirmacaoLink = document.getElementById("pontos-confirmacao-link");
  if (pontosConfirmacaoLink) {
    const uid = userId || localStorage.getItem("userId") || "defaultUser";
    pontosConfirmacaoLink.href = `confirmacao.html?user=${encodeURIComponent(uid)}`;
  }
}

window.addEventListener("DOMContentLoaded", updateMenuVisibility);
window.addEventListener("storage", updateMenuVisibility);


// ==========================
// MONTANTE E OBSERVAÇÃO
// ==========================
const inputMontante = document.getElementById("montante");
const inputObs = document.getElementById("observacao");

function formatarMoeda(valor) {
  if (!valor && valor !== 0) return "";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

if (inputMontante) {
  inputMontante.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    e.target.value = value ? formatarMoeda(parseFloat(value) / 100) : "";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  if (inputMontante) {
    const montanteSalvo = localStorage.getItem("montante");
    if (montanteSalvo) inputMontante.value = formatarMoeda(parseFloat(montanteSalvo));
  }
  if (inputObs) {
    const observacaoSalva = localStorage.getItem("observacao");
    if (observacaoSalva) inputObs.value = observacaoSalva;
  }
});

function salvarMontante() {
  if (!inputMontante) return;
  const valor = inputMontante.value.replace(/\D/g, "");
  if (valor) localStorage.setItem("montante", parseFloat(valor) / 100);
}

function salvarObservacao() {
  if (!inputObs) return;
  localStorage.setItem("observacao", inputObs.value);
}

// ==========================
// EVENTOS DO DIA
// ==========================
const eventsList = document.getElementById("events-list");

async function fetchTodayEvents() {
  if (!eventsList) return;

  if (!isGoogleAuthenticated()) {
    eventsList.innerHTML = '<li>Conecte seu Gmail na tela da <a href="calendario.html" style="color:#FF6A00;font-weight:600;">Agenda</a> para ver os eventos de hoje.</li>';
    return;
  }

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  try {
    const response = await gapi.client.calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const data = response.result.items || [];
    eventsList.innerHTML = "";

    if (data.length > 0) {
      data.forEach((event) => {
        const li = document.createElement("li");
        const eventTime = new Date(event.start.dateTime || event.start.date);
        li.textContent = `${eventTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${event.summary}`;
        eventsList.appendChild(li);
      });
    } else {
      eventsList.innerHTML = "<li>Nenhum evento hoje.</li>";
    }
  } catch (err) {
    console.error("Erro ao buscar eventos:", err);
    eventsList.innerHTML = "<li>Erro ao carregar eventos.</li>";
  }
}

// ==========================
// CHAMADA INICIAL
// ==========================
// home.js está no final do <body> (sem defer), então o DOM já existe
// quando este código roda. Registra o callback assim que possível,
// para não perder a notificação caso initGoogleAPI() (chamado no
// window.onload) seja rápido.
onGoogleAuthChange(fetchTodayEvents);

// ====================================================
// MENU NO CELULAR — botão ☰ abre/fecha o menu em tela cheia.
// ====================================================
(function () {
  const menu = document.getElementById("menuPrincipal");
  const botao = document.getElementById("btnMenuMobile");
  if (!menu || !botao) return;
  botao.addEventListener("click", (e) => {
    e.preventDefault();
    const aberto = menu.classList.toggle("aberto-mobile");
    document.body.classList.toggle("menu-mobile-aberto", aberto);
    if (aberto) menu.scrollTop = 0;
    botao.querySelector("i").className = aberto ? "bx bx-x" : "bx bx-menu";
    botao.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
  });
})();
