// ============================================================
// google-auth.js
// Conexão com o Google Agenda — usada em home.html e calendario.html.
//
// COMO FUNCIONA AGORA (sem piscar a tela):
// A pessoa conecta o Gmail UMA vez, na tela do Calendário. O Google
// devolve uma autorização permanente, que fica guardada no Worker
// (servidor), ligada ao login da pessoa no FNX TECH. Depois disso, cada
// página só pede ao Worker uma "chave de acesso" nova — sem abrir
// janela do Google, sem piscar, inclusive no celular.
//
// ANTES: toda vez que a tela inicial abria, o site abria uma janela
// do Google escondida pra renovar o acesso (era isso que piscava). No
// celular essa janela costumava ser bloqueada, por isso os eventos de
// hoje não apareciam.
//
// Trocar de Gmail: tela do Calendário → "Trocar conta".
// ============================================================

const GOOGLE_CLIENT_ID = (typeof FNX_GOOGLE_CLIENT_ID !== "undefined") ? FNX_GOOGLE_CLIENT_ID : "";
const GOOGLE_API_KEY = (typeof FNX_GOOGLE_API_KEY !== "undefined") ? FNX_GOOGLE_API_KEY : "";
const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar openid email profile";

let googleTokenExpiresAt = 0;
let googleApiReady = false;
let googleApiIniciando = false;
let googleApiErroInicializacao = null;
let googleEmailConectado = "";
let googleAvisoConexao = ""; // ex.: "a conexão expirou, conecte de novo"

// Limpa as marcações do jeito antigo (não são mais usadas)
localStorage.removeItem("googleLogado");

const onGoogleAuthReadyCallbacks = [];
const onGoogleAuthChangeCallbacks = [];

function onGoogleAuthReady(callback) {
  if (googleApiReady) callback();
  else onGoogleAuthReadyCallbacks.push(callback);
}

function onGoogleAuthChange(callback) {
  onGoogleAuthChangeCallbacks.push(callback);
  onGoogleAuthReady(callback);
}

function notifyGoogleAuthReady() {
  const jaEstavaPronto = googleApiReady;
  googleApiReady = true;
  if (!jaEstavaPronto) {
    onGoogleAuthReadyCallbacks.forEach((cb) => {
      try { cb(); } catch (err) { console.error("Erro num callback de auth:", err); }
    });
    onGoogleAuthReadyCallbacks.length = 0;
  } else {
    onGoogleAuthChangeCallbacks.forEach((cb) => {
      try { cb(); } catch (err) { console.error("Erro num callback de auth:", err); }
    });
  }
}

function getGoogleEmailSalvo() {
  return googleEmailConectado || localStorage.getItem("googleEmail") || "";
}

function aplicarTokenGoogle(resposta) {
  gapi.client.setToken({ access_token: resposta.accessToken });
  googleTokenExpiresAt = Date.now() + (resposta.expiresIn || 3000) * 1000;
  googleEmailConectado = resposta.email || "";
  if (googleEmailConectado) localStorage.setItem("googleEmail", googleEmailConectado);
  googleAvisoConexao = "";
}

function limparTokenGoogle() {
  if (window.gapi && gapi.client) gapi.client.setToken(null);
  googleTokenExpiresAt = 0;
  googleEmailConectado = "";
  localStorage.removeItem("googleEmail");
}

// Pede ao Worker uma chave de acesso nova. Nunca abre janela.
async function buscarTokenGoogleNoServidor() {
  try {
    const resp = await chamarWorker("google-token");
    if (resp.ok && resp.conectado) {
      aplicarTokenGoogle(resp);
      return true;
    }
    limparTokenGoogle();
    if (resp.ok && resp.motivo) googleAvisoConexao = resp.motivo;
    if (!resp.ok) googleAvisoConexao = resp.erro || "";
    return false;
  } catch (e) {
    console.warn("[google-auth] Não foi possível falar com o servidor:", e);
    return false;
  }
}

// Chamado quando o script do Google (api.js) termina de carregar.
function initGoogleAPI() {
  if (googleApiIniciando || googleApiReady) return;
  // Integração com o Google ainda não configurada (config.js) — o
  // site segue funcionando, só sem o Google Agenda.
  if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY || !window.gapi) {
    googleApiErroInicializacao = new Error("Google Agenda não configurado");
    notifyGoogleAuthReady();
    return;
  }
  googleApiIniciando = true;

  gapi.load("client", () => {
    gapi.client
      .init({ apiKey: GOOGLE_API_KEY, discoveryDocs: GOOGLE_DISCOVERY_DOCS })
      .then(async () => {
        await buscarTokenGoogleNoServidor();
        notifyGoogleAuthReady();
      })
      .catch((erro) => {
        console.error("[google-auth] Falha ao inicializar a Google Calendar API:", erro);
        googleApiErroInicializacao = erro;
        googleApiIniciando = false;
        notifyGoogleAuthReady();
      });
  });
}

// Conectar / trocar de conta — abre a janela do Google UMA vez.
// Precisa ser chamado direto de um clique de botão (senão o celular
// bloqueia a janela).
function googleLoginInterativo(onDone) {
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    alert("O Google ainda está carregando. Espere alguns segundos e tente de novo.");
    return;
  }
  const cliente = google.accounts.oauth2.initCodeClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    ux_mode: "popup",
    select_account: true, // sempre deixa escolher qual Gmail usar
    callback: async (resposta) => {
      if (resposta.error) return; // pessoa fechou a janela ou não autorizou
      const r = await chamarWorker("google-conectar", { method: "POST", body: { code: resposta.code } });
      if (!r.ok) {
        alert(r.erro || "Não foi possível conectar com o Google.");
        return;
      }
      aplicarTokenGoogle(r);
      notifyGoogleAuthReady();
      if (onDone) onDone();
    },
    error_callback: (erro) => {
      if (erro && erro.type === "popup_failed_to_open") {
        alert("O navegador bloqueou a janela do Google. Libere janelas pop-up para este site e tente de novo.");
      }
    },
  });
  cliente.requestCode();
}

async function googleLogout(onDone) {
  await chamarWorker("google-desconectar", { method: "POST" });
  limparTokenGoogle();
  notifyGoogleAuthReady();
  if (onDone) onDone();
}

function isGoogleAuthenticated() {
  return !!(window.gapi && gapi.client && gapi.client.getToken && gapi.client.getToken());
}

// A chave de acesso do Google vale 1 hora. Com a página aberta por
// muito tempo, pede uma nova ao Worker antes de vencer (sem janela).
setInterval(() => {
  if (!googleEmailConectado) return;
  if (googleTokenExpiresAt - Date.now() < 5 * 60 * 1000) buscarTokenGoogleNoServidor();
}, 4 * 60 * 1000);


// ============================================================
// Tipo do evento da agenda (criado pelo FNX TECH): "visita", "pagamento"
// ou "outro". Fica guardado no próprio evento do Google
// (extendedProperties.private.enjobTipo). Eventos antigos, de antes
// disso (ou criados direto no Google), são adivinhados pelo texto.
// ============================================================
function tipoEventoEnjob(ev) {
  const priv = (ev && (ev.extendedProperties?.private || ev.extendedProps?.privado)) || {};
  if (["visita", "pagamento", "outro"].includes(priv.enjobTipo)) return priv.enjobTipo;
  const texto = String([ev.summary || ev.title || "", ev.description || "", priv.clientePagamento || ""].join(" "))
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(boleto|pagamento|pagar|vencimento|fatura|parcela)\b/.test(texto)) return "pagamento";
  if (/\b(visita|vistoria|orcamento|medicao|levantamento)\b/.test(texto)) return "visita";
  return "outro";
}
