// ============================================================
// validacao.js
// Marca visualmente os campos de um formulário com erro (borda
// vermelha + mensagem abaixo do campo), em vez de usar alert().
// Reutilizado em Funcionários, Extrato, Materiais e Relatórios.
// ============================================================

if (!document.getElementById("validacao-style")) {
  const style = document.createElement("style");
  style.id = "validacao-style";
  style.textContent = `
    .campo-com-erro {
      border-color: crimson !important;
      background-color: rgba(220, 20, 60, 0.05) !important;
    }
    .mensagem-erro-campo {
      color: crimson;
      font-size: 12px;
      font-weight: 600;
      margin-top: 4px;
      display: block;
    }
  `;
  document.head.appendChild(style);
}

// Marca um campo com erro: adiciona borda vermelha e uma mensagem
// abaixo dele. Se o campo já tinha uma mensagem de erro, substitui.
function marcarCampoComErro(elemento, mensagem) {
  if (!elemento) return;
  elemento.classList.add("campo-com-erro");

  // Procura se já existe uma mensagem de erro logo depois do campo
  let msgEl = elemento.nextElementSibling;
  if (!msgEl || !msgEl.classList.contains("mensagem-erro-campo")) {
    msgEl = document.createElement("span");
    msgEl.className = "mensagem-erro-campo";
    elemento.insertAdjacentElement("afterend", msgEl);
  }
  msgEl.textContent = mensagem;
}

// Remove a marcação de erro de um campo específico.
function limparErroCampo(elemento) {
  if (!elemento) return;
  elemento.classList.remove("campo-com-erro");
  const msgEl = elemento.nextElementSibling;
  if (msgEl && msgEl.classList.contains("mensagem-erro-campo")) {
    msgEl.remove();
  }
}

// Remove a marcação de erro de todos os campos dentro de um container
// (geralmente um <form> ou modal). Chame isso no início de cada
// validação, antes de marcar os novos erros.
function limparErrosDoFormulario(container) {
  if (!container) return;
  container.querySelectorAll(".campo-com-erro").forEach((el) => el.classList.remove("campo-com-erro"));
  container.querySelectorAll(".mensagem-erro-campo").forEach((el) => el.remove());
}

// Foca e rola a tela até o primeiro campo com erro, para o usuário
// ver imediatamente o que precisa corrigir.
function focarPrimeiroErro(container) {
  const primeiro = container.querySelector(".campo-com-erro");
  if (primeiro) {
    primeiro.scrollIntoView({ behavior: "smooth", block: "center" });
    primeiro.focus({ preventScroll: true });
  }
}

// Remove o erro de um campo automaticamente quando o usuário começa
// a corrigi-lo (digita ou seleciona algo novo).
function limparErroAoEditar(elemento) {
  if (!elemento) return;
  const evento = elemento.tagName === "SELECT" ? "change" : "input";
  elemento.addEventListener(evento, () => limparErroCampo(elemento));
}