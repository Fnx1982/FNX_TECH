// ============================================================
// auth-guard.js — protege páginas internas contra acesso sem
// login. Inclua este script (depois de auth-worker.js) em toda
// página que não seja login.html, registro.html ou usuario.html.
//
// O Workers KV tem propagação global "eventual" (não instantânea) —
// uma sessão criada no login pode, por alguns segundos, ainda não
// estar visível para leitura em todo lugar. Sem tolerância a isso,
// um usuário que loga e navega rápido pra outra página podia ser
// expulso de volta pro login mesmo com a sessão válida. Por isso
// tentamos de novo algumas vezes, com um pequeno intervalo, antes de
// desistir e redirecionar.
//
// IMPORTANTE — botão Voltar do navegador: quando alguém clica
// "Sair" e depois aperta Voltar, o navegador pode restaurar esta
// página direto do cache local dele (bfcache), SEM executar o
// carregamento normal de novo — então a checagem abaixo não rodaria
// e a tela antiga (de antes do logout) ficaria visível como se a
// pessoa ainda estivesse logada. O listener "pageshow" no fim do
// arquivo existe exatamente pra cobrir esse caso: ele detecta
// quando a página voltou do cache do navegador (não de um
// carregamento novo) e reconfirma a sessão do zero.
// ============================================================

(function () {
  const TENTATIVAS = 3;
  const INTERVALO_MS = 600;

  function dormir(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function verificarSessao() {
    const token = localStorage.getItem("sessionToken");
    if (!token) return null;

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        const r = await fetch(FNX_API + "?action=auth-session-check", {
          headers: { Authorization: "Bearer " + token },
        });
        if (r.ok) {
          const data = await r.json();
          if (data.ok) return data; // sessão confirmada
        }
      } catch (e) {
        // falha de rede — tenta de novo (não desiste na primeira)
      }
      if (tentativa < TENTATIVAS) await dormir(INTERVALO_MS);
    }
    return null; // esgotou as tentativas — sessão realmente inválida/expirada
  }

  function limparSessaoEExpulsar() {
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("userType");
    localStorage.removeItem("userId");
    localStorage.removeItem("userNome");
    localStorage.removeItem("userSetor");
    window.location.href = "login.html";
  }

  function rodarChecagem() {
    if (!localStorage.getItem("sessionToken")) {
      window.location.href = "login.html";
      return;
    }
    verificarSessao().then((data) => {
      if (!data) { limparSessaoEExpulsar(); return; }
      // Mantém os dados de sessão sincronizados
      localStorage.setItem("userType", data.tipo || "");
      localStorage.setItem("userId", data.registro || "");
      localStorage.setItem("userNome", data.nome || "");
      localStorage.setItem("userSetor", data.setor || "");
      // senha temporária: obriga a trocar antes de usar o sistema
      if (data.deveTrocarSenha && !/trocar-senha(\.html)?$/.test(location.pathname)) {
        window.location.href = "trocar-senha.html";
      }
    });
  }

  // Checagem normal, ao carregar a página pela primeira vez.
  rodarChecagem();

  // Checagem extra, quando a página é restaurada do cache do
  // navegador (botão Voltar/Avançar) em vez de carregada do zero —
  // "event.persisted" é true exatamente nesse caso.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) rodarChecagem();
  });
})();