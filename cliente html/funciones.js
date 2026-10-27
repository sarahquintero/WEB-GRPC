// 1. Importaciones gRPC-Web (según tu proyecto)

// Ajusta estas rutas según tus stubs generados
import * as grpcWeb from 'grpc-web';
import { ServicioStreamingClient } from './stubs_generados/servicios_grpc_web_pb.js'; // Ajusta el nombre
import { SolicitudAudio } from './stubs_generados/servicios_pb.js'; // Ajusta el nombre


// 2. Variables globales

const logDiv = document.getElementById('log');
const reproductor = document.getElementById('reproductor');
const btnPedir = document.getElementById('btnPedir');
const tituloInput = document.getElementById('tituloCancion');
const formatoSelect = document.getElementById('formato');

let wsReacciones = null; // WebSocket al servidor de reacciones
let audioActual = null;  // Guardar el título del audio actual


// 3. Función para loguear mensajes

function log(mensaje) {
    const ahora = new Date().toLocaleTimeString();
    logDiv.innerHTML += `[${ahora}] ${mensaje}\n`;
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(mensaje);
}


// 4. Conexión WebSocket al Servidor de Reacciones

function conectarWebSocketReacciones(tituloAudio) {
    if (wsReacciones) {
        // Si ya hay conexión, cerrarla antes de crear otra
        wsReacciones.close();
    }

    // Ajusta la URL según la guía (el servidor de reacciones usa WebSockets)
    // La guía no especifica el puerto exacto, pero suele ser algo como ws://localhost:PUERTO
    wsReacciones = new WebSocket('ws://localhost:8081'); // <-- AJUSTA EL PUERTO

    wsReacciones.onopen = () => {
        log(`Conectado al servidor de reacciones para el audio: ${tituloAudio}`);
        // Registrar al usuario en el canal del audio actual
        wsReacciones.send(JSON.stringify({ accion: 'registrar', audio: tituloAudio }));
    };

    wsReacciones.onmessage = (event) => {
        log(`Reacción recibida: ${event.data}`);
        // Aquí puedes mostrar la reacción en la UI si lo deseas
    };

    wsReacciones.onerror = (error) => {
        log(`Error en WebSocket de reacciones: ${error.message}`);
    };

    wsReacciones.onclose = () => {
        log('Conexión WebSocket de reacciones cerrada.');
    };
}

function desconectarWebSocketReacciones() {
    if (wsReacciones && wsReacciones.readyState === WebSocket.OPEN) {
        // Desregistrar al usuario del canal
        wsReacciones.send(JSON.stringify({ accion: 'desregistrar', audio: audioActual }));
        wsReacciones.close();
        wsReacciones = null;
        log('Desconectado del servidor de reacciones.');
    }
}

// 5. Listeners de play/pause
reproductor.addEventListener('play', () => {
    log('Reproducción iniciada (play).');
    if (audioActual) {
        conectarWebSocketReacciones(audioActual);
    }
});

reproductor.addEventListener('pause', () => {
    log('Reproducción pausada (pause).');
    desconectarWebSocketReacciones();
});

// 6. Lógica para pedir la canción (gRPC-Web)

btnPedir.addEventListener('click', () => {
    const titulo = tituloInput.value.trim();
    const formato = formatoSelect.value;

    if (!titulo) {
        log('Error: Debes ingresar un título de canción.');
        return;
    }

    audioActual = titulo;
    log(`Iniciando llamada gRPC-Web a través de Envoy...`);
    log(`Solicitud preparada: { titulo: "${titulo}", formato: "${formato}" }`);

    // Crear cliente gRPC-Web apuntando al proxy Envoy (puerto 8080)
    const cliente = new ServicioStreamingClient('http://localhost:8080', null, null);

    // Crear la solicitud
    const solicitud = new SolicitudAudio();
    solicitud.setTitulo(titulo);
    solicitud.setFormato(formato);

    // Variable para acumular fragmentos (si el servidor envía streaming)
    let fragmentosRecibidos = 0;
    const chunks = [];

    // Llamada al servidor de streaming (asumiendo que es un método server-streaming)
    // AJUSTA el nombre del método según tu .proto (ej: 'streamingAudio', 'obtenerAudio', etc.)
    const stream = cliente.streamingAudio(solicitud, {});

    stream.on('data', (response) => {
        fragmentosRecibidos++;
        const fragmento = response.getFragmento(); // AJUSTA según tu .proto
        if (fragmento) {
            chunks.push(fragmento);
            log(`Fragmento recibido desde el servidor. Tamaño: ${fragmento.length} bytes`);

            if (fragmentosRecibidos === 1) {
                log('Primer fragmento recibido. Reproductor mostrado.');
                reproductor.style.display = 'block';
            }

            // Convertir fragmentos a Blob y reproducir
            const blob = new Blob(chunks, { type: 'audio/mp3' }); // Ajusta el tipo MIME
            const url = URL.createObjectURL(blob);
            reproductor.src = url;
        }
    });

    stream.on('status', (status) => {
        log(`Transmisión de la canción finalizada. Preparando reproducción... (Status: ${status.code})`);
    });

    stream.on('end', () => {
        log('Reproducción de la canción iniciada con éxito.');
        reproductor.play();
    });

    stream.on('error', (err) => {
        log(`Error en la llamada gRPC-Web: ${err.message}`);
    });
});

// 7. Log inicial

log('Cliente web cargado. Esperando acción del usuario...');