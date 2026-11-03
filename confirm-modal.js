// ============================================================
// confirm-modal.js
// Modal de confirmação reutilizável, no estilo visual do site,
// para substituir o confirm() nativo do navegador.
//
// Uso:
//   confirmarAcao("Excluir usuário?", "Essa ação não pode ser desfeita.")
//     .then((confirmado) => {
//       if (confirmado) { ...faz a exclusão... }
//     });
//
// Funciona como uma Promise: resolve com true (confirmou) ou
// false (cancelou / fechou o modal).
// ============================================================

function _criarEstruturaModalConfirmacao() {
  if (document.getElementById("modal-confirmacao-global")) return;

  const overlay = document.createElement("div");
  overlay.id = "modal-confirmacao-global";
  overlay.className = "confirm-modal-overlay";
  overlay.innerHTML = `
    <div class="confirm-modal-content">
      <p class="confirm-modal-titulo" id="confirm-modal-titulo"></p>
      <p class="confirm-modal-texto" id="confirm-modal-texto"></p>
      <div class="confirm-modal-botoes">
        <button type="button" class="confirm-modal-cancelar" id="confirm-modal-cancelar">Cancelar</button>
        <button type="button" class="confirm-modal-confirmar" id="confirm-modal-confirmar">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Injeta o CSS necessário uma única vez, mesmo se a página
  // não tiver carregado um confirm-modal.css separado.
  if (!document.getElementById("confirm-modal-style")) {
    const style = document.createElement("style");
    style.id = "confirm-modal-style";
    style.textContent = `
      .confirm-modal-overlay {
        display: none;
        position: fixed;
        z-index: 2000;
        left: 0; top: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.55);
        justify-content: center;
        align-items: center;
      }
      .confirm-modal-overlay.active {
        display: flex;
      }
      .confirm-modal-content {
        background: white;
        border-radius: 10px;
        padding: 24px;
        width: 90%;
        max-width: 380px;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        font-family: Arial, sans-serif;
      }
      .confirm-modal-titulo {
        font-size: 18px;
        font-weight: bold;
        color: #333;
        margin: 0 0 8px;
      }
      .confirm-modal-texto {
        font-size: 14px;
        color: #666;
        margin: 0 0 20px;
      }
      .confirm-modal-botoes {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .confirm-modal-botoes button {
        flex: 1;
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        font-size: 14px;
        transition: 0.2s;
        font-family: inherit;
      }
      .confirm-modal-cancelar {
        background: rgb(225, 225, 225);
        color: #333;
      }
      .confirm-modal-cancelar:hover {
        background: rgb(208, 208, 208);
      }
      .confirm-modal-confirmar {
        background: crimson;
        color: white;
      }
      .confirm-modal-confirmar:hover {
        background: #a30000;
      }
    `;
    document.head.appendChild(style);
  }
}

function confirmarAcao(titulo, texto) {
  _criarEstruturaModalConfirmacao();

  const overlay = document.getElementById("modal-confirmacao-global");
  const tituloEl = document.getElementById("confirm-modal-titulo");
  const textoEl = document.getElementById("confirm-modal-texto");
  const btnCancelar = document.getElementById("confirm-modal-cancelar");
  const btnConfirmar = document.getElementById("confirm-modal-confirmar");

  tituloEl.textContent = titulo || "Tem certeza?";
  textoEl.textContent = texto || "";
  textoEl.style.display = texto ? "block" : "none";

  overlay.classList.add("active");

  return new Promise((resolve) => {
    function limpar(resultado) {
      overlay.classList.remove("active");
      btnCancelar.removeEventListener("click", onCancelar);
      btnConfirmar.removeEventListener("click", onConfirmar);
      overlay.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeydown);
      resolve(resultado);
    }
    function onCancelar() { limpar(false); }
    function onConfirmar() { limpar(true); }
    function onOverlayClick(e) {
      if (e.target === overlay) limpar(false);
    }
    function onKeydown(e) {
      if (e.key === "Escape") limpar(false);
      if (e.key === "Enter") limpar(true);
    }

    btnCancelar.addEventListener("click", onCancelar);
    btnConfirmar.addEventListener("click", onConfirmar);
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeydown);
  });
}

// ============================================================
// Modal de escolha entre várias opções (ex: "Qual nota você quer
// emitir?" com botões "NF-e" / "NFS-e" / "Cancelar"), no mesmo
// estilo visual do modal de confirmação acima.
//
// Uso:
//   escolherOpcao("Qual nota emitir?", "", ["NF-e (materiais)", "NFS-e (mão de obra)"])
//     .then((escolhida) => {
//       // escolhida = o texto do botão clicado, ou null se cancelou
//     });
// ============================================================
function _criarEstruturaModalEscolha() {
  if (document.getElementById("modal-escolha-global")) return;

  const overlay = document.createElement("div");
  overlay.id = "modal-escolha-global";
  overlay.className = "confirm-modal-overlay";
  overlay.innerHTML = `
    <div class="confirm-modal-content">
      <p class="confirm-modal-titulo" id="escolha-modal-titulo"></p>
      <p class="confirm-modal-texto" id="escolha-modal-texto"></p>
      <div class="confirm-modal-botoes" id="escolha-modal-botoes" style="flex-direction:column;"></div>
      <button type="button" class="confirm-modal-cancelar" id="escolha-modal-cancelar" style="margin-top:10px; width:100%;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(overlay);
  _criarEstruturaModalConfirmacao(); // garante que o <style> compartilhado já foi injetado
}

function escolherOpcao(titulo, texto, opcoes) {
  _criarEstruturaModalEscolha();

  const overlay = document.getElementById("modal-escolha-global");
  const tituloEl = document.getElementById("escolha-modal-titulo");
  const textoEl = document.getElementById("escolha-modal-texto");
  const botoesContainer = document.getElementById("escolha-modal-botoes");
  const btnCancelar = document.getElementById("escolha-modal-cancelar");

  tituloEl.textContent = titulo || "Escolha uma opção";
  textoEl.textContent = texto || "";
  textoEl.style.display = texto ? "block" : "none";
  botoesContainer.innerHTML = "";

  overlay.classList.add("active");

  return new Promise((resolve) => {
    function limpar(resultado) {
      overlay.classList.remove("active");
      botoesContainer.querySelectorAll("button").forEach((b) => b.replaceWith(b.cloneNode(true))); // remove listeners
      btnCancelar.removeEventListener("click", onCancelar);
      overlay.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeydown);
      resolve(resultado);
    }
    function onCancelar() { limpar(null); }
    function onOverlayClick(e) { if (e.target === overlay) limpar(null); }
    function onKeydown(e) { if (e.key === "Escape") limpar(null); }

    opcoes.forEach((opcao) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "confirm-modal-confirmar";
      btn.textContent = opcao;
      btn.addEventListener("click", () => limpar(opcao));
      botoesContainer.appendChild(btn);
    });

    btnCancelar.addEventListener("click", onCancelar);
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeydown);
  });
}

// ============================================================
// Toast de aviso temporário (substitui o alert() nativo para
// mensagens de sucesso/erro que não precisam de confirmação,
// como "Cadastro realizado com sucesso!").
// ============================================================
function mostrarToast(mensagem, tipo) {
  let toast = document.getElementById("toast-aviso-global");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-aviso-global";
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "12px 22px";
    toast.style.borderRadius = "30px";
    toast.style.fontWeight = "600";
    toast.style.fontSize = "14px";
    toast.style.fontFamily = "inherit";
    toast.style.color = "white";
    toast.style.zIndex = "3000";
    toast.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
    toast.style.transition = "opacity 0.3s";
    toast.style.maxWidth = "90vw";
    toast.style.textAlign = "center";
    document.body.appendChild(toast);
  }
  toast.style.backgroundColor = tipo === "erro" ? "crimson" : "rgb(28, 138, 75)";
  toast.textContent = mensagem;
  toast.style.opacity = "1";
  clearTimeout(toast._timeoutId);
  toast._timeoutId = setTimeout(() => {
    toast.style.opacity = "0";
  }, 2800);
}