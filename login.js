// ============================================================
// login.js — autentica via Worker (server-side). Depende de
// auth-worker.js estar carregado antes deste arquivo.
// ============================================================

window.onload = function () {
    var registroSalvo = localStorage.getItem("registroSalvo");
    if (registroSalvo) {
        document.getElementById("registro").value = registroSalvo;
        document.getElementById("lembrar").checked = true;
    }
};

async function logar() {
    var registro = document.getElementById("registro").value.trim();
    var senha = document.getElementById("senha").value;
    var lembrar = document.getElementById("lembrar").checked;

    var mensagemErro = document.getElementById("mensagemErroLogin");
    if (mensagemErro) mensagemErro.style.display = "none";

    var botao = document.querySelector("button.login");
    var textoOriginal = botao ? botao.textContent : "";
    if (botao) { botao.disabled = true; botao.textContent = "Entrando..."; }

    try {
        var resposta = await apiLogin(registro, senha);

        if (!resposta.ok) {
            if (mensagemErro) {
                mensagemErro.textContent = resposta.erro || "Registro ou senha incorretos. Tente novamente.";
                mensagemErro.style.display = "block";
            }
            return;
        }

        if (lembrar) {
            localStorage.setItem("registroSalvo", registro);
        } else {
            localStorage.removeItem("registroSalvo");
        }

        localStorage.setItem("sessionToken", resposta.token);
        localStorage.setItem("userType", resposta.tipo || "");
        localStorage.setItem("userId", resposta.registro || "");
        localStorage.setItem("userNome", resposta.nome || "");
        localStorage.setItem("userSetor", resposta.setor || "");

        navegarLogin(resposta.deveTrocarSenha ? "trocar-senha.html" : "home.html");
    } catch (e) {
        if (mensagemErro) {
            mensagemErro.textContent = "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
            mensagemErro.style.display = "block";
        }
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = textoOriginal; }
    }
}

// ── Recuperar senha ──────────────────────────────────────────
document.getElementById("linkRecuperarSenha").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("campoRegistroRecuperar").value = document.getElementById("registro").value || "";
    document.getElementById("mensagemRecuperarSenha").textContent = "";
    document.getElementById("modalRecuperarSenha").style.display = "flex";
});

document.getElementById("btnCancelarRecuperar").addEventListener("click", () => {
    document.getElementById("modalRecuperarSenha").style.display = "none";
});

document.getElementById("btnEnviarRecuperar").addEventListener("click", async () => {
    const registro = document.getElementById("campoRegistroRecuperar").value.trim();
    const mensagem = document.getElementById("mensagemRecuperarSenha");
    if (!registro) { mensagem.style.color = "crimson"; mensagem.textContent = "Informe o registro."; return; }

    const botao = document.getElementById("btnEnviarRecuperar");
    botao.disabled = true;
    botao.textContent = "Enviando...";
    try {
        const resposta = await apiSolicitarReset(registro);
        mensagem.style.color = resposta.ok ? "#1C8A4B" : "crimson";
        mensagem.textContent = resposta.ok
            ? "Se o registro existir e tiver e-mail cadastrado, a senha temporária já foi enviada. Confira sua caixa de entrada."
            : (resposta.erro || "Erro ao solicitar recuperação.");
    } catch (e) {
        mensagem.style.color = "crimson";
        mensagem.textContent = "Não foi possível conectar ao servidor.";
    } finally {
        botao.disabled = false;
        botao.textContent = "Enviar";
    }
});

function navegarLogin(url) {
    window.location.href = url;
}