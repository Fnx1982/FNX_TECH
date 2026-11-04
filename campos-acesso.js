// Regras dos campos de acesso (iguais às do servidor):
// - Registro: só letras (com acento) e números.
// - Senha: letras, números e símbolos; sem emoji e sem espaço.
// O que não pode é removido na hora da digitação/colagem, com um aviso curto.
(function () {
  const RE_FORA_REGISTRO = /[^\p{L}\p{N}]/gu;
  const RE_FORA_SENHA = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}‍️\s\p{C}]/gu;
  const SELETOR_REGISTRO = "#registro, #campoRegistroRecuperar, #registroRecuperar";

  // Aviso flutuante (não empurra nem sobrepõe o formulário)
  let aviso = null, timerAviso = null;
  function avisar(campo, texto) {
    if (!aviso) {
      aviso = document.createElement("div");
      aviso.className = "aviso-campo-acesso";
      aviso.setAttribute("role", "status");
      aviso.setAttribute("aria-live", "polite");
      aviso.style.cssText = "position:fixed; left:50%; bottom:28px; transform:translateX(-50%); z-index:7000; max-width:calc(100vw - 32px);" +
        "background:#16161A; color:#fff; border:1px solid #E5141B; border-left:4px solid #E5141B; border-radius:12px; padding:10px 16px;" +
        "font:600 13px Montserrat, sans-serif; box-shadow:0 10px 30px rgba(0,0,0,.4); text-align:center; transition:opacity .2s;";
      document.body.appendChild(aviso);
    }
    aviso.textContent = texto;
    aviso.style.opacity = "1";
    aviso.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => { aviso.style.opacity = "0"; setTimeout(() => { aviso.hidden = true; }, 220); }, 3000);
  }

  function limpar(campo, regex, texto) {
    const antes = campo.value;
    const depois = antes.replace(regex, "");
    if (depois === antes) return;
    const pos = campo.selectionStart;
    campo.value = depois;
    // cursor volta para onde estava, descontando só o que foi removido antes dele
    const p = pos == null ? depois.length : antes.slice(0, pos).replace(regex, "").length;
    try { campo.setSelectionRange(p, p); } catch (e) { /* alguns tipos de campo não aceitam */ }
    avisar(campo, texto);
  }

  function ligar() {
    document.querySelectorAll(SELETOR_REGISTRO).forEach((c) => {
      if (c.dataset.regraAcesso) return;
      c.dataset.regraAcesso = "registro";
      c.removeAttribute("inputmode");
      c.setAttribute("autocapitalize", "off");
      c.setAttribute("autocomplete", c.getAttribute("autocomplete") || "username");
      c.maxLength = 40;
      c.addEventListener("input", () => limpar(c, RE_FORA_REGISTRO, "Registro: só letras e números (sem espaço, símbolo ou emoji)."));
    });
    // marca as senhas pelo tipo inicial (o botão de "ver senha" troca o tipo para text)
    document.querySelectorAll('input[type="password"]').forEach((c) => {
      if (c.dataset.regraAcesso) return;
      c.dataset.regraAcesso = "senha";
      c.maxLength = 128;
      c.addEventListener("input", () => limpar(c, RE_FORA_SENHA, "Senha: emoji e espaço não são aceitos."));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();
