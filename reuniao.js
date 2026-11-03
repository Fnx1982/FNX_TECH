// ============================================================
// reuniao.js — chamada de vídeo via Jitsi Meet (servidor público
// meet.jit.si, sem necessidade de infraestrutura própria).
// ============================================================

const JITSI_DOMAIN = "meet.jit.si";
const PREFIXO_SALA = "EnJobEngenharia-"; // reduz chance de colisão com salas de outras pessoas no servidor público

let jitsiApi = null;
let salaAtualEhRestrita = false;

function limparNomeSala(texto) {
  return texto
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function gerarNomeAleatorio() {
  const adjetivos = ["rapida", "urgente", "diaria", "semanal", "geral", "tecnica"];
  const adj = adjetivos[Math.floor(Math.random() * adjetivos.length)];
  const numero = Math.floor(1000 + Math.random() * 9000);
  return `reuniao-${adj}-${numero}`;
}

function carregarScriptJitsi() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) { resolve(); return; }
    const script = document.createElement("script");
    script.src = `https://${JITSI_DOMAIN}/external_api.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o Jitsi Meet. Verifique sua internet."));
    document.head.appendChild(script);
  });
}

async function entrarNaSala(opcoes) {
  opcoes = opcoes || {};
  let nomeSala, salaCompleta, restrita;

  if (opcoes.slugFixo) {
    // Entrando numa sala FIXA (da lista carregada do servidor) — usa o
    // slug exato configurado pelo admin, não o campo de texto livre.
    nomeSala = opcoes.slugFixo;
    salaCompleta = PREFIXO_SALA + "fixa-" + opcoes.slugFixo;
    restrita = !!opcoes.restrita;
  } else {
    const campoNome = document.getElementById("campoNomeSala");
    const nomeDigitado = limparNomeSala(campoNome.value);
    nomeSala = nomeDigitado || gerarNomeAleatorio();
    salaCompleta = PREFIXO_SALA + nomeSala;
    restrita = false; // salas avulsas nunca têm lobby automático
  }

  const botao = document.getElementById("btnEntrarSala");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Conectando...";

  try {
    await carregarScriptJitsi();

    const nomeUsuario = localStorage.getItem("userNome") || "Convidado";

    document.getElementById("telaEntrada").classList.add("escondido");
    document.getElementById("telaChamada").classList.add("ativa");
    document.getElementById("nomeSalaAtual").textContent = opcoes.nomeExibicao || nomeSala;
    salaAtualEhRestrita = restrita;

    const container = document.getElementById("molduraJitsi");
    container.innerHTML = "";

    jitsiApi = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
      roomName: salaCompleta,
      parentNode: container,
      userInfo: { displayName: nomeUsuario },
      configOverwrite: {
        prejoinPageEnabled: true,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
      },
    });

    jitsiApi.addListener("readyToClose", () => sairDaSala());

    // Salas restritas (Diretoria, TI, etc.) ligam o "Lobby" do Jitsi
    // automaticamente assim que a pessoa entra — depois disso, quem
    // tentar entrar na sala precisa ser aceito por alguém que já está
    // na chamada. Isso só funciona de verdade se a primeira pessoa a
    // entrar for quem ativa; combinado com a sala já ser filtrada por
    // setor no nosso próprio sistema, cobre o caso de uso pedido.
    if (restrita) {
      jitsiApi.addListener("videoConferenceJoined", () => {
        try { jitsiApi.executeCommand("toggleLobby", true); }
        catch (e) { /* ignora se o servidor Jitsi não suportar nesse momento */ }
      });
    }

    // Guarda a sala atual para o botão "Copiar link" e para o caso de
    // a pessoa recarregar a página querendo continuar na mesma sala.
    window.__salaAtualNome = nomeSala;
    window.__salaAtualCompleta = salaCompleta;
  } catch (e) {
    document.getElementById("telaEntrada").classList.remove("escondido");
    document.getElementById("telaChamada").classList.remove("ativa");
    alert(e.message || "Não foi possível entrar na reunião. Tente novamente.");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

// ── Salas fixas ──────────────────────────────────────────────
async function carregarSalasFixas() {
  try {
    const resposta = await apiListarSalasReuniao();
    if (!resposta.ok || !resposta.salas || resposta.salas.length === 0) return;

    const bloco = document.getElementById("blocoSalasFixas");
    const lista = document.getElementById("listaSalasFixas");
    const separador = document.getElementById("separadorOu");
    lista.innerHTML = "";

    resposta.salas.forEach((sala) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item-sala-fixa";
      btn.innerHTML = `
        <span class="nome">🎥 ${escaparHtml(sala.nome)}${sala.restrita ? '<span class="badge-restrita">Restrita</span>' : ""}</span>
        <span class="seta">Entrar →</span>
      `;
      btn.addEventListener("click", () => {
        entrarNaSala({ slugFixo: sala.slug, restrita: sala.restrita, nomeExibicao: sala.nome });
      });
      lista.appendChild(btn);
    });

    bloco.style.display = "block";
    separador.style.display = "flex";
  } catch (e) {
    // Sem salas fixas configuradas ainda, ou erro de rede — a pessoa
    // ainda pode criar uma sala avulsa normalmente, então não bloqueia
    // a tela por causa disso.
  }
}

function sairDaSala() {
  if (jitsiApi) {
    jitsiApi.dispose();
    jitsiApi = null;
  }
  document.getElementById("molduraJitsi").innerHTML = "";
  document.getElementById("telaEntrada").classList.remove("escondido");
  document.getElementById("telaChamada").classList.remove("ativa");
}

async function copiarLinkSala() {
  if (!window.__salaAtualCompleta) return;
  const link = `https://${JITSI_DOMAIN}/${window.__salaAtualCompleta}`;
  const botao = document.getElementById("btnCopiarLink");
  const textoOriginal = botao.textContent;
  try {
    await navigator.clipboard.writeText(link);
    botao.textContent = "✓ Link copiado!";
  } catch (e) {
    // Alguns navegadores/contextos (ex: http sem HTTPS) bloqueiam o
    // clipboard — mostra o link para copiar manualmente nesse caso.
    prompt("Copie o link abaixo para compartilhar:", link);
  }
  setTimeout(() => { botao.textContent = textoOriginal; }, 2000);
}

document.getElementById("btnEntrarSala").addEventListener("click", entrarNaSala);
document.getElementById("btnGerarNome").addEventListener("click", () => {
  document.getElementById("campoNomeSala").value = gerarNomeAleatorio();
});
document.getElementById("campoNomeSala").addEventListener("keydown", (e) => {
  if (e.key === "Enter") entrarNaSala();
});
document.getElementById("btnSairSala").addEventListener("click", sairDaSala);
document.getElementById("btnCopiarLink").addEventListener("click", copiarLinkSala);

// Se a pessoa chegou aqui por um link direto (?sala=nome-da-sala),
// pré-preenche o campo — facilita entrar numa sala que foi compartilhada.
const parametrosUrl = new URLSearchParams(window.location.search);
const salaDaUrl = parametrosUrl.get("sala");
if (salaDaUrl) {
  document.getElementById("campoNomeSala").value = limparNomeSala(salaDaUrl);
}

carregarSalasFixas();