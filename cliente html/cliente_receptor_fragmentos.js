// cliente_receptor_fragmentos.js
const { peticionDTO } = require('./stubs_generados/servicios_pb.js');
const { AudioServicePromiseClient } = require('./stubs_generados/servicios_grpc_web_pb.js');

const ENVOY_HOST = 'http://localhost:8080';
const client = new AudioServicePromiseClient(ENVOY_HOST);

let audioChunks = [];
const audioPlayer = document.getElementById('reproductor');
let _firstFragmentReceived = false;
let audioActual = "";

// ==========================================
// LÓGICA DE STOMP (Reacciones)
// ==========================================
let stompClient = null;
let subscription = null;

// ==========================================
// CATÁLOGO DE AUDIOS (Datos simulados para la interfaz)
// ==========================================
const catalogo = {
    "Musica": [
        { id: "cancion1", nombre: "cancion1.mp3", detalles: { "Artista Principal": "Artista 1", "Álbum": "Álbum 1", "Género Musical": "Pop" } },
        { id: "cancion2", nombre: "cancion2.mp3", detalles: { "Artista Principal": "Artista 2", "Álbum": "Álbum 2", "Género Musical": "Rock" } }
    ],
    "Podcast": [
        { id: "podcast1", nombre: "podcast1.mp3", detalles: { "Nombre del Podcast": "Podcast 1", "Título del Episodio": "Episodio 1", "Anfitrión": "Host 1" } }
    ],
    "Audiolibro": [
        { id: "libro1", nombre: "libro1.mp3", detalles: { "Título del Libro": "Libro 1", "Autor": "Autor 1", "Narrador": "Narrador 1" } }
    ],
    "RuidoBlanco": [
        { id: "ruido1", nombre: "ruido1.mp3", detalles: { "Tipo de Sonido": "Ruido Blanco", "Fuente del Audio": "Lluvia", "Uso Sugerido": "Dormir" } }
    ]
};

// Referencias a los elementos del DOM
const selectTipo = document.getElementById('tipoAudio');
const selectAudio = document.getElementById('listaAudios');
const divDetalles = document.getElementById('detallesAudio');
const listaDetalles = document.getElementById('listaDetalles');
const btnPedir = document.getElementById('btnPedir');

// 1. Evento al cambiar el Tipo de Audio
selectTipo.addEventListener('change', (e) => {
    const tipo = e.target.value;
    selectAudio.innerHTML = '<option value="">-- Seleccione un audio --</option>';
    divDetalles.style.display = 'none';
    btnPedir.disabled = true;

    if (tipo && catalogo[tipo]) {
        selectAudio.disabled = false;
        catalogo[tipo].forEach(audio => {
            const option = document.createElement('option');
            option.value = audio.id; // Ej: "cancion1"
            option.textContent = audio.nombre; // Ej: "cancion1.mp3"
            selectAudio.appendChild(option);
        });
    } else {
        selectAudio.disabled = true;
    }
});

// 2. Evento al cambiar el Audio seleccionado
selectAudio.addEventListener('change', (e) => {
    const tipo = selectTipo.value;
    const audioId = e.target.value;

    if (audioId && catalogo[tipo]) {
        const audioData = catalogo[tipo].find(a => a.id === audioId);

        // Mostrar detalles
        listaDetalles.innerHTML = '';
        for (const [clave, valor] of Object.entries(audioData.detalles)) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${clave}:</strong> ${valor}`;
            listaDetalles.appendChild(li);
        }
        divDetalles.style.display = 'block';
        btnPedir.disabled = false;
    } else {
        divDetalles.style.display = 'none';
        btnPedir.disabled = true;
    }
});

// 3. Modificar el botón de Pedir Canción para usar el select
btnPedir.addEventListener('click', () => {
    const titulo = selectAudio.value; // Ej: "cancion1"
    const formato = "mp3"; // Asumimos mp3 por ahora

    if (!titulo) return;

    window.__writeAudioLog(`Solicitud preparada: { titulo: "${titulo}", formato: "${formato}" }`);
    if (window.iniciar_streaming_cancion) {
        window.iniciar_streaming_cancion(titulo, formato);
    } else {
        window.__writeAudioLog("Error: La función iniciar_streaming_cancion no está cargada.", "error");
    }
});

// Función que se llama desde el HTML al dar clic en un emoji
function enviarReaccionServidor(event) {
    if (!stompClient || !stompClient.connected) {
        window.__writeAudioLog("No estás conectado al servidor de reacciones. Dale Play primero.", "error");
        return;
    }

    const emoji = event.target.getAttribute('data-reaction');
    const mensaje = {
        audio: audioActual,
        reaccion: emoji,
        usuario: "UsuarioWeb"
    };

    // Enviamos la reacción. La ruta "/app/enviaReaccion" debe coincidir con tu @MessageMapping en Java
    stompClient.send("/app/enviaReaccion", {}, JSON.stringify(mensaje));

    // Mostrar en mi propia pantalla que envié la reacción
    window.__writeAudioLog(`Reacción enviada: ${emoji}`, 'success');
    mostrarReaccionEnChat("Yo", emoji);
}

function mostrarReaccionEnChat(usuario, emoji) {
    const mensajesDiv = document.getElementById('mensajes');
    mensajesDiv.innerHTML += `<div><b>${usuario}:</b> ${emoji}</div>`;
    mensajesDiv.scrollTop = mensajesDiv.scrollHeight;
}

function conectarSTOMP() {
    if (stompClient !== null) return;

    const socket = new SockJS('http://localhost:5000/ws');
    stompClient = Stomp.over(socket);

    // Desactivar logs de depuración de STOMP (opcional)
    stompClient.debug = null;

    stompClient.connect({}, function (frame) {
        window.__writeAudioLog('Conectado a STOMP Reacciones', 'success');

        // Suscribirse al canal del audio actual
        const canal = `/brokerDeReacciones/reaccionesPorCancion`;
        subscription = stompClient.subscribe(canal, function (message) {
            const body = JSON.parse(message.body);
            window.__writeAudioLog(`Reacción recibida de otro usuario: ${body.reaccion}`, 'info');
            mostrarReaccionEnChat("Otro", body.reaccion);
        });

        window.__writeAudioLog(`Suscrito al canal: ${canal}`);
    }, function (error) {
        window.__writeAudioLog(`Error en STOMP: ${error}`, 'error');
    });
}

function desconectarSTOMP() {
    if (subscription) {
        subscription.unsubscribe();
        subscription = null;
    }
    if (stompClient !== null) {
        stompClient.disconnect(function () {
            window.__writeAudioLog('Desconectado del servidor de reacciones.');
        });
        stompClient = null;
    }
}

// ==========================================
// LISTENERS PLAY / PAUSE (Registro/Desregistro)
// ==========================================
if (audioPlayer) {
    audioPlayer.addEventListener('play', () => {
        window.__writeAudioLog('Reproducción iniciada (play).', 'success');
        if (audioActual) {
            conectarSTOMP(); // Se conecta y suscribe al canal
            document.getElementById('reacciones').style.display = 'block';
            document.getElementById('chat').style.display = 'block';
        }
    });

    audioPlayer.addEventListener('pause', () => {
        window.__writeAudioLog('Reproducción pausada (pause).', 'warning');
        desconectarSTOMP(); // Se desuscribe y desconecta
        document.getElementById('reacciones').style.display = 'none';
        document.getElementById('chat').style.display = 'none';
    });
}

// ==========================================
// LÓGICA DE STREAMING GRPC-WEB
// ==========================================
function iniciar_streaming_cancion(titulo, formato) {
    window.__writeAudioLog("Iniciando llamada gRPC-Web a través de Envoy...");
    audioActual = titulo;
    _firstFragmentReceived = false;
    audioChunks = [];

    // Limpiar el chat de reacciones anterior
    document.getElementById('mensajes').innerHTML = '';

    const request = new peticionDTO();
    request.setTitulo(titulo);
    request.setFormato(formato);

    const stream = client.enviarCancionMedianteStream(request, {});

    stream.on('data', (response) => {
        const data = response.getData_asU8();
        window.__writeAudioLog(`Fragmento recibido desde el servidor. Tamaño: ${data.length} bytes`);

        audioChunks.push(data);

        if (!_firstFragmentReceived) {
            _firstFragmentReceived = true;
            if (audioPlayer) {
                audioPlayer.style.display = 'block';
            }
            window.__writeAudioLog('Primer fragmento recibido. Reproductor mostrado.', 'success');
        }
    });

    stream.on('end', () => {
        window.__writeAudioLog('✅ Transmisión de la canción finalizada. Preparando reproducción...');

        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);

        if (audioPlayer) {
            audioPlayer.src = audioUrl;
            audioPlayer.play()
                .then(() => {
                    window.__writeAudioLog('▶️ Reproducción de la canción iniciada con éxito.', 'success');
                    registrarReproduccion(audioActual);
                })
                .catch(error => {
                    window.__writeAudioLog('❌ Error al iniciar la reproducción automática. Intente dar clic en el reproductor.', 'error');
                });
        }
    });

    stream.on('error', (err) => {
        window.__writeAudioLog(`ERROR en la comunicación gRPC-Web: ${err.message}`, 'error');
    });
}

// ==========================================
// LÓGICA DE SUSCRIPCIÓN Y PAGOS REAL (FETCH + TIMEOUT)
// ==========================================
let pagoEnProceso = false;
let ultimoTokenUsado = "";

document.getElementById('btnPagar').addEventListener('click', async () => {
    if (pagoEnProceso) {
        window.__writeAudioLog("Ya hay un pago en proceso, por favor espere.", "warning");
        return;
    }

    const plan = document.getElementById('planSelect').value;

    // 1. Generar Token Idempotente
    const tokenIdempotente = 'TOKEN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    ultimoTokenUsado = tokenIdempotente;
    document.getElementById('txtTokenUsado').value = ultimoTokenUsado;

    window.__writeAudioLog(`[Cliente] Iniciando pago para el plan: ${plan}`, 'info');
    window.__writeAudioLog(`[Cliente] Token idempotente generado: ${tokenIdempotente}`, 'info');

    pagoEnProceso = true;
    document.getElementById('btnPagar').disabled = true;

    await enviarPagoAlServidor(tokenIdempotente, plan, 1);
});

// --- NUEVO: Lógica para simular el uso de un token repetido ---
document.getElementById('btnSimularToken').addEventListener('click', async () => {
    if (!ultimoTokenUsado) {
        window.__writeAudioLog("[Cliente] Primero debe realizar un pago para generar un token.", "warning");
        return;
    }

    if (pagoEnProceso) {
        window.__writeAudioLog("Ya hay un pago en proceso, por favor espere.", "warning");
        return;
    }

    const plan = document.getElementById('planSelect').value;
    window.__writeAudioLog(`[Cliente] 🔄 SIMULANDO REUTILIZACIÓN DEL TOKEN...`, 'warning');
    window.__writeAudioLog(`[Cliente] Usando token anterior: ${ultimoTokenUsado}`, 'warning');

    pagoEnProceso = true;
    document.getElementById('btnSimularToken').disabled = true;

    // Enviamos el MISMO token al servidor
    await enviarPagoAlServidor(ultimoTokenUsado, plan, 1);

    document.getElementById('btnSimularToken').disabled = false;
});

async function enviarPagoAlServidor(token, plan, intento) {
    window.__writeAudioLog(`[Cliente] Enviando token ${token} al servidor de pagos (Intento ${intento})...`, 'info');

    // Configuramos un temporizador (timeout) de 3 segundos usando AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const respuesta = await fetch('http://localhost:5000/api/pagos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, plan: plan }),
            signal: controller.signal
        });

        clearTimeout(timeoutId); // Cancelar el temporizador si hubo respuesta

        if (!respuesta.ok) throw new Error("Error en el servidor");

        const data = await respuesta.json();

        // 3. Ecos del servidor en el cliente
        window.__writeAudioLog(`[Servidor] ${data.mensaje}`, 'success');
        window.__writeAudioLog(`[Servidor] Almacenado: ${data.almacenado}`, 'success');

        finalizarPago();

    } catch (error) {
        // Si el error es por el temporizador (Timeout)
        if (error.name === 'AbortError') {
            window.__writeAudioLog(`[Cliente] ⚠️ Timeout: El servidor no respondió en 3 segundos.`, 'warning');

            if (intento === 1) {
                window.__writeAudioLog(`[Cliente] ⏱️ Temporizador de reenvío activado. Reintentando con el mismo token...`, 'warning');
                // Reintentar después de 2 segundos
                setTimeout(() => {
                    enviarPagoAlServidor(token, plan, 2);
                }, 2000);
            } else {
                window.__writeAudioLog(`[Cliente] ❌ Falla definitiva: El servidor no responde.`, 'error');
                finalizarPago();
            }
        } else {
            window.__writeAudioLog(`[Cliente] ❌ Error de red: ${error.message}`, 'error');
            finalizarPago();
        }
    }
}

function finalizarPago() {
    pagoEnProceso = false;
    document.getElementById('btnPagar').disabled = false;
}


// ==========================================
// LÓGICA DEL HISTORIAL DE REPRODUCCIÓN (Requerimiento d)
// ==========================================

// Función para registrar una reproducción en localStorage
function registrarReproduccion(audioId) {
    // Obtenemos el historial actual o iniciamos uno vacío
    let historial = JSON.parse(localStorage.getItem('historialAudios')) || {};

    // Aumentamos el contador para ese audio
    historial[audioId] = (historial[audioId] || 0) + 1;

    // Guardamos de vuelta en localStorage
    localStorage.setItem('historialAudios', JSON.stringify(historial));

    // Actualizamos la interfaz gráfica
    actualizarHistorialUI();
}

// Función para dibujar el historial en el HTML
function actualizarHistorialUI() {
    const lista = document.getElementById('listaHistorial');
    if (!lista) return;

    lista.innerHTML = ''; // Limpiamos la lista

    let historial = JSON.parse(localStorage.getItem('historialAudios')) || {};

    // Si está vacío, mostramos un mensaje
    if (Object.keys(historial).length === 0) {
        lista.innerHTML = '<li style="color: gray;">Aún no has reproducido ningún audio.</li>';
        return;
    }

    // Recorremos el historial y creamos los elementos de la lista
    for (const [audio, cantidad] of Object.entries(historial)) {
        const li = document.createElement('li');
        li.style.marginBottom = "5px";
        li.style.borderBottom = "1px solid #ddd";
        li.style.paddingBottom = "5px";
        li.innerHTML = `<strong>${audio}</strong> - Reproducido <b>${cantidad}</b> ${cantidad === 1 ? 'vez' : 'veces'}`;
        lista.appendChild(li);
    }
}

// Cargar el historial cuando la página termine de cargar
document.addEventListener('DOMContentLoaded', actualizarHistorialUI);


// ==========================================
// LÓGICA DE ADMINISTRADOR (Requerimiento f)
// ==========================================
const adminTipo = document.getElementById('adminTipoAudio');
const adminMetaContainer = document.getElementById('adminMetadatos');

const camposPorTipo = {
    "Musica": ["Artista Principal", "Álbum", "Género Musical"],
    "Podcast": ["Nombre del Podcast", "Título del Episodio", "Anfitrión"],
    "Audiolibro": ["Título del Libro", "Autor", "Narrador"],
    "RuidoBlanco": ["Tipo de Sonido", "Fuente del Audio", "Uso Sugerido"]
};

// Cambiar dinámicamente los campos de metadatos
adminTipo.addEventListener('change', (e) => {
    const tipo = e.target.value;
    adminMetaContainer.innerHTML = '';

    if (tipo && camposPorTipo[tipo]) {
        adminMetaContainer.style.display = 'block';
        camposPorTipo[tipo].forEach(campo => {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            div.innerHTML = `
                <label style="font-size: 13px;">${campo}:</label>
                <input type="text" class="admin-meta-input" data-campo="${campo}" style="width: 100%; padding: 4px; box-sizing: border-box;">
            `;
            adminMetaContainer.appendChild(div);
        });
    } else {
        adminMetaContainer.style.display = 'none';
    }
});

// Enviar el formulario al servidor
document.getElementById('btnSubirAdmin').addEventListener('click', async () => {
    const archivo = document.getElementById('inputArchivoAudio').files[0];
    const tipo = adminTipo.value;

    if (!archivo || !tipo) {
        window.__writeAudioLog("[Admin] Debe seleccionar un archivo y un tipo.", "error");
        return;
    }

    // Recolectar metadatos dinámicos
    const metadata = {};
    document.querySelectorAll('.admin-meta-input').forEach(input => {
        metadata[input.getAttribute('data-campo')] = input.value;
    });

    // Crear el FormData
    const formData = new FormData();
    formData.append("archivo", archivo);
    formData.append("tipo", tipo);
    formData.append("metadata", JSON.stringify(metadata));

    window.__writeAudioLog(`[Admin] Subiendo ${archivo.name} y sus metadatos...`, 'info');
    document.getElementById('btnSubirAdmin').disabled = true;

    try {
        // Enviamos al servidor Java (puerto 5000)
        const response = await fetch('http://localhost:5000/api/admin/subirAudio', {
            method: 'POST',
            body: formData // fetch configura el Content-Type automáticamente como multipart/form-data
        });

        const data = await response.json();

        if (data.exito) {
            window.__writeAudioLog(`[Servidor Admin] ✅ ${data.mensaje}`, 'success');
        } else {
            window.__writeAudioLog(`[Servidor Admin] ❌ Error: ${data.mensaje}`, 'error');
        }
    } catch (error) {
        window.__writeAudioLog(`[Admin] Error de red al subir: ${error.message}`, 'error');
    } finally {
        document.getElementById('btnSubirAdmin').disabled = false;
    }
});

if (typeof window !== 'undefined') {
    window.iniciar_streaming_cancion = iniciar_streaming_cancion;
    window.enviarReaccionServidor = enviarReaccionServidor; // Exportar para el HTML
}