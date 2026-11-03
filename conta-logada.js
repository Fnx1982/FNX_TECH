// ============================================================
// conta-logada.js — mostra QUEM está logado (tela inicial).
//
// Um botão redondo com as iniciais, ao lado do sino. Tocando nele,
// abre um quadrinho com: nome, setor, registro, o Gmail conectado ao
// calendário e o botão Sair. No computador o nome aparece ao lado
// das iniciais; no celular só as iniciais (pra caber na barra).
// ============================================================
(function () {
  function iniciais(nome) {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return (primeira + ultima).toUpperCase();
  }

  function esc(t) { return typeof escaparHtml === "function" ? escaparHtml(t) : String(t || ""); }

  const caixa = document.createElement("div");
  caixa.id = "contaLogada";
  caixa.innerHTML = `
    <button type="button" id="btnContaLogada" aria-label="Minha conta">
      <span class="avatar-conta" id="avatarConta">?</span>
      <span class="nome-conta" id="nomeContaCurto"></span>
    </button>
    <div id="painelConta" hidden>
      <div class="painel-conta-topo">
        <span class="avatar-conta grande" id="avatarContaGrande">?</span>
        <div>
          <div class="painel-conta-nome" id="painelContaNome"></div>
          <div class="painel-conta-setor" id="painelContaSetor"></div>
        </div>
      </div>
      <div class="painel-conta-foto">
        <button type="button" id="btnTrocarFotoPerfil">📷 Colocar foto</button>
        <button type="button" id="btnRemoverFotoPerfil" hidden>Remover foto</button>
        <input type="file" id="inputFotoPerfil" accept="image/*" hidden />
      </div>
      <div class="painel-conta-linha"><span>Registro</span><b id="painelContaRegistro"></b></div>
      <div class="painel-conta-linha"><span>Gmail do calendário</span><b id="painelContaGmail"></b></div>
      <button type="button" class="painel-conta-sair" id="btnContaSair">Sair da conta</button>
    </div>
  `;
  document.body.appendChild(caixa);

  // Mostra a foto (se tiver) ou as iniciais dentro das bolinhas
  function aplicarAvatar(el, nome) {
    const foto = localStorage.getItem("userFotoPerfil");
    if (foto) {
      el.textContent = "";
      el.style.backgroundImage = `url("${foto}")`;
      el.classList.add("com-foto");
    } else {
      el.style.backgroundImage = "";
      el.classList.remove("com-foto");
      el.textContent = iniciais(nome);
    }
  }

  function preencher() {
    const nome = localStorage.getItem("userNome") || "Usuário";
    const setor = localStorage.getItem("userSetor") || "";
    const registro = localStorage.getItem("userId") || "-";
    const primeiroNome = nome.split(/\s+/)[0];
    aplicarAvatar(document.getElementById("avatarConta"), nome);
    aplicarAvatar(document.getElementById("avatarContaGrande"), nome);
    const temFoto = !!localStorage.getItem("userFotoPerfil");
    document.getElementById("btnTrocarFotoPerfil").textContent = temFoto ? "📷 Trocar foto" : "📷 Colocar foto";
    document.getElementById("btnRemoverFotoPerfil").hidden = !temFoto;
    document.getElementById("nomeContaCurto").textContent = primeiroNome;
    document.getElementById("painelContaNome").textContent = nome;
    document.getElementById("painelContaSetor").textContent = setor;
    document.getElementById("painelContaRegistro").textContent = registro;
    const gmail = typeof getGoogleEmailSalvo === "function" ? getGoogleEmailSalvo() : "";
    document.getElementById("painelContaGmail").innerHTML = gmail
      ? esc(gmail)
      : 'Não conectado · <a href="calendario.html">conectar</a>';
  }

  const painel = document.getElementById("painelConta");
  document.getElementById("btnContaLogada").addEventListener("click", (e) => {
    e.stopPropagation();
    preencher();
    painel.hidden = !painel.hidden;
  });
  painel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => { painel.hidden = true; });

  // "Sair da conta" usa a mesma confirmação do item Sair do menu
  document.getElementById("btnContaSair").addEventListener("click", () => {
    painel.hidden = true;
    const linkSair = document.getElementById("logout-link");
    if (linkSair) linkSair.click();
  });

  // ---------- Foto de perfil ----------
  // Corta a foto no meio (quadrada) e reduz pra 200x200 antes de enviar
  // — fica leve (uns 15 KB) e carrega na hora.
  function reduzirFoto(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("Não foi possível ler a foto."));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Esse arquivo não é uma imagem que o navegador consiga abrir."));
        img.onload = () => {
          const lado = Math.min(img.width, img.height);
          const tela = document.createElement("canvas");
          tela.width = 200; tela.height = 200;
          tela.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 200, 200);
          resolve(tela.toDataURL("image/jpeg", 0.85));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  const inputFoto = document.getElementById("inputFotoPerfil");
  document.getElementById("btnTrocarFotoPerfil").addEventListener("click", () => inputFoto.click());
  inputFoto.addEventListener("change", async () => {
    const arquivo = inputFoto.files && inputFoto.files[0];
    inputFoto.value = "";
    if (!arquivo) return;
    const botao = document.getElementById("btnTrocarFotoPerfil");
    botao.disabled = true; botao.textContent = "Enviando…";
    try {
      const foto = await reduzirFoto(arquivo);
      const r = await chamarWorker("perfil-foto-salvar", { method: "POST", body: { foto } });
      if (!r.ok) throw new Error(r.erro || "Não foi possível salvar a foto.");
      localStorage.setItem("userFotoPerfil", foto);
    } catch (e) {
      alert(e.message);
    }
    botao.disabled = false;
    preencher();
  });
  document.getElementById("btnRemoverFotoPerfil").addEventListener("click", async () => {
    if (!confirm("Remover sua foto de perfil?")) return;
    const r = await chamarWorker("perfil-foto-remover", { method: "POST" });
    if (!r.ok) { alert(r.erro || "Não foi possível remover."); return; }
    localStorage.removeItem("userFotoPerfil");
    preencher();
  });

  // A foto fica guardada no navegador pra aparecer na hora; aqui busca
  // a versão do servidor (vale se trocou de foto em outro aparelho).
  async function sincronizarFoto() {
    try {
      const r = await chamarWorker("perfil-foto-get");
      if (!r.ok) return;
      if (r.foto) localStorage.setItem("userFotoPerfil", r.foto);
      else localStorage.removeItem("userFotoPerfil");
      preencher();
    } catch (e) { /* sem conexão: segue com a guardada */ }
  }

  preencher();
  sincronizarFoto();
  // O nome é atualizado pela checagem de sessão logo depois que a
  // página abre — atualiza o botão quando isso acontecer.
  setTimeout(preencher, 1500);
  if (typeof onGoogleAuthChange === "function") onGoogleAuthChange(preencher);
})();
