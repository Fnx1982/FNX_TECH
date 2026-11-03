// ============================================================
// senha-visivel.js
// Adiciona um botão de "mostrar/ocultar senha" (ícone de olho) em
// qualquer campo <input type="password"> da página, de forma
// automática.
//
// O botão fica dentro de um wrapper posicionado normalmente no
// fluxo do documento (nada de "position: fixed" com recálculo por
// scroll/resize/timeout, que era a causa do ícone desalinhado em
// formulários com várias colunas).
//
// Se o campo já tiver um ícone do lado (ex: o cadeado da tela de
// login), o botão do olho é posicionado automaticamente à esquerda
// desse ícone, em vez de ficar por cima.
//
// AJUSTE FINO: se a distância entre os dois ícones ficar maior ou
// menor do que você quer, mude o número abaixo.
// - Número MAIOR  -> botão do olho se afasta mais do cadeado (vai
//                    mais para a esquerda).
// - Número MENOR (ou negativo) -> botão do olho chega mais perto
//                    do cadeado (vai mais para a direita).
const ESPACO_ENTRE_ICONES = -14; // em pixels
// ============================================================

function ativarOlhoSenha() {
  injetarEstilosOlhoSenha();

  document.querySelectorAll('input[type="password"]').forEach((campo) => {
    // Evita aplicar duas vezes no mesmo campo.
    if (campo.dataset.olhoAtivado) return;
    campo.dataset.olhoAtivado = "true";

    ativarComBotaoNovo(campo);
  });
}

function injetarEstilosOlhoSenha() {
  if (document.getElementById("senha-visivel-style")) return;

  const style = document.createElement("style");
  style.id = "senha-visivel-style";
  style.textContent = `
    .wrapper-olho-senha {
      position: relative !important;
      display: block !important;
      width: 100% !important;
    }
    .wrapper-olho-senha input {
      padding-right: 38px !important;
      box-sizing: border-box !important;
      width: 100% !important;
    }
    /* "all: unset" remove qualquer estilo global de botão do site
       (ex: regras genéricas tipo ".container button" usadas nos
       botões Salvar/Excluir), evitando que o botão do olho vire um
       "pill" esticado e centralizado. Os !important garantem que
       nada sobrescreva de novo por especificidade de CSS. */
    .btn-olho-senha {
      all: unset;
      box-sizing: border-box !important;
      position: absolute !important;
      top: 50% !important;
      right: 8px !important;
      left: auto !important;
      bottom: auto !important;
      transform: translateY(-50%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      max-width: 24px !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      cursor: pointer !important;
      font-size: 18px !important;
      color: #888 !important;
      line-height: 1 !important;
    }
    .btn-olho-senha:hover {
      color: #555 !important;
    }
    .icone-olho-senha {
      cursor: pointer !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);
}

function temBoxicons() {
  return [...document.styleSheets].some((sheet) => {
    try {
      return sheet.href && sheet.href.includes("boxicons");
    } catch {
      return false;
    }
  });
}

function ativarComBotaoNovo(campo) {
  const paiOriginal = campo.parentElement;
  // Ícone que já existia do lado do campo antes da gente mexer
  // (ex: o cadeado do login.html). Se existir, o botão do olho
  // é posicionado à esquerda dele, em vez de ficar por cima.
  const iconeVizinho = paiOriginal
    ? paiOriginal.querySelector(":scope > i, :scope > svg")
    : null;

  const wrapper = document.createElement("div");
  wrapper.className = "wrapper-olho-senha";

  campo.parentNode.insertBefore(wrapper, campo);
  wrapper.appendChild(campo);

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "btn-olho-senha";
  botao.setAttribute("aria-label", "Mostrar senha");
  botao.innerHTML = temBoxicons() ? '<i class="bx bx-hide"></i>' : "Mostrar";

  let visivel = false;
  botao.addEventListener("click", () => {
    visivel = !visivel;
    campo.type = visivel ? "text" : "password";

    if (temBoxicons()) {
      botao.innerHTML = visivel ? '<i class="bx bx-show"></i>' : '<i class="bx bx-hide"></i>';
    } else {
      botao.textContent = visivel ? "Ocultar" : "Mostrar";
    }
    botao.setAttribute("aria-label", visivel ? "Ocultar senha" : "Mostrar senha");
  });

  wrapper.appendChild(botao);

  if (iconeVizinho) {
    const posicionarAoLadoDoIcone = () => {
      const retCampo = campo.getBoundingClientRect();
      const retIcone = iconeVizinho.getBoundingClientRect();
      const retWrapper = wrapper.getBoundingClientRect();
      if (retCampo.width === 0 || retIcone.width === 0) return;

      // Distância da borda direita do campo até a borda esquerda do
      // ícone já existente. O "+ ESPACO_ENTRE_ICONES" é o número que
      // você pode ajustar lá no topo do arquivo.
      const distancia = Math.max(retCampo.right - retIcone.left + ESPACO_ENTRE_ICONES, 8);
      botao.style.setProperty("right", distancia + "px", "important");
      campo.style.setProperty("padding-right", distancia + 30 + "px", "important");

      // Alinha verticalmente com o CENTRO REAL do ícone existente,
      // em vez de assumir que os dois ficam no centro do campo —
      // ícones de tamanhos diferentes podem ter centros visuais
      // ligeiramente diferentes mesmo dentro do mesmo campo.
      const centroIconeY = retIcone.top + retIcone.height / 2 - retWrapper.top;
      botao.style.setProperty("top", centroIconeY + "px", "important");
      botao.style.setProperty("transform", "translateY(-50%)", "important");

      // Usa o mesmo tamanho de fonte do ícone existente, para os
      // dois ficarem visualmente do mesmo tamanho.
      const tamanhoIcone = window.getComputedStyle(iconeVizinho).fontSize;
      if (tamanhoIcone) {
        botao.style.setProperty("font-size", tamanhoIcone, "important");
      }
    };

    posicionarAoLadoDoIcone();
    // Recalcula se a janela for redimensionada (ex: zoom ou
    // mudança de largura da tela alterando a posição do ícone).
    window.addEventListener("resize", posicionarAoLadoDoIcone);
  }
}

// Ativa automaticamente quando o DOM estiver pronto. Se algum
// campo de senha for criado dinamicamente depois (ex: um modal
// aberto via JS), basta chamar ativarOlhoSenha() de novo.
document.addEventListener("DOMContentLoaded", ativarOlhoSenha);