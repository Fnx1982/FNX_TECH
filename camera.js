// ============================================================
// camera.js — botão "📷 Tirar foto" ao lado dos campos de foto.
//
// No celular, abre a câmera direto pelo site: tira a foto e ela já
// entra no campo, sem precisar sair, abrir a câmera do celular e
// depois procurar a foto na galeria. O botão normal de escolher
// arquivo continua lá, pra quando a foto já estiver na galeria.
//
// Só aparece em aparelho com tela de toque (no computador não muda nada)
// e só em campos que aceitam imagem.
// ============================================================
(function () {
  const ehCelular = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!ehCelular) return;

  function aceitaImagem(input) {
    return (input.getAttribute("accept") || "").toLowerCase().includes("image");
  }

  function prepararCampo(input) {
    if (input.dataset.cameraPronta || input.dataset.ehCamera) return;
    if (!aceitaImagem(input)) return;
    if (getComputedStyle(input).display === "none") return; // campos escondidos (ex.: Armazenamento) ficam como estão
    input.dataset.cameraPronta = "1";

    // Campo invisível que abre a CÂMERA (capture) em vez da galeria
    const camera = document.createElement("input");
    camera.type = "file";
    camera.accept = "image/*";
    camera.setAttribute("capture", "environment"); // câmera traseira
    camera.dataset.ehCamera = "1";
    camera.style.display = "none";

    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = "📷 Tirar foto";
    botao.style.cssText = "display:inline-flex; align-items:center; gap:4px; margin:6px 6px 0 0; padding:8px 16px; border-radius:20px; border:1px solid #FF6A00; background:#FFF6EF; color:#B34700; font-weight:700; font-size:14px; font-family:inherit; cursor:pointer;";
    botao.addEventListener("click", () => camera.click());

    camera.addEventListener("change", () => {
      if (!camera.files || !camera.files.length) return;
      try {
        // Coloca a foto tirada dentro do campo original — assim o resto
        // do site funciona igual a quando se escolhe um arquivo.
        const transferencia = new DataTransfer();
        for (const arquivo of camera.files) transferencia.items.add(arquivo);
        input.files = transferencia.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        botao.textContent = "📷 Foto adicionada — tirar outra";
      } catch (e) {
        alert("Este celular não deixou colocar a foto direto. Use o botão de escolher arquivo.");
      }
      camera.value = "";
    });

    input.insertAdjacentElement("afterend", botao);
    botao.insertAdjacentElement("afterend", camera);
  }

  function procurarCampos() {
    document.querySelectorAll('input[type="file"]').forEach(prepararCampo);
  }
  procurarCampos();
  // Campos que aparecem depois (janelas abertas na hora) também ganham o botão
  new MutationObserver(procurarCampos).observe(document.body, { childList: true, subtree: true });
})();
