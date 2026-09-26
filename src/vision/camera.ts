/** Error de cámara con un mensaje listo para mostrar al jugador. */
export class CameraError extends Error {}

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('La cámara solo funciona si la página se abre con https o desde localhost.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  } catch (error) {
    throw new CameraError(cameraErrorMessage(error));
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No hay permiso para usar la cámara. Actívalo desde el icono de la barra de direcciones y vuelve a intentarlo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró ninguna cámara.';
    case 'NotReadableError':
      return 'La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.';
    default:
      return 'No se pudo encender la cámara.';
  }
}
