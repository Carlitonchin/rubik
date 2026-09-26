# Visión del juego

Un cubo Rubik en 3D en el navegador que se arma con gestos de las manos frente a la webcam, como si hicieras jutsus. Sirve para aprender a armar el cubo desde cero y para que un experto lo resuelva de forma fluida y espectacular, y grabarlo para compartirlo en redes.

## Principios

1. **Para todo público.** Tiene que servir a quien nunca ha armado un cubo ni conoce la notación (R, U, F…) y también a quien ya resuelve rápido.
2. **Sin jerga por defecto.** Las instrucciones usan flechas, resaltados y lenguaje normal ("sube la columna derecha"). La notación estándar es opcional, para expertos.
3. **Espectacular visto desde fuera.** Un video de alguien resolviendo tiene que causar un efecto "wow": respuesta instantánea, efectos que conectan la mano con el cubo, técnicas con nombre.
4. **Aprender con práctica.** Al principio cuesta; con entrenamiento se forma memoria muscular y los movimientos salen solos.
5. **Todo local.** La cámara se procesa y se graba en el propio equipo. No se sube nada salvo que el usuario decida compartir.

## Modos de control

| Modo | Cómo se juega | Para quién |
|---|---|---|
| Fácil | Teclado, o arrastrar con el dedo o el ratón sobre las piezas | Cualquiera, en móvil o PC |
| Medio | La mano funciona como puntero: pellizco + arrastrar | Quien quiere usar la cámara sin aprender sellos |
| Ninja | Sellos con las manos, sin cursor | Quien quiere entrenar y dominarlo |

Todos los modos envían las mismas órdenes (girar una capa, rotar el cubo, deshacer, mezclar) a un único motor del cubo. Cada modo es solo una forma distinta de leer lo que hace el jugador. Fácil y medio comparten la lógica de arrastrar sobre una pieza; solo cambia de dónde sale el puntero.

## Modo ninja: el lenguaje de sellos

Cada movimiento se forma con tres cosas: **qué mano, qué forma y hacia dónde la mueves**. Regla general: **la capa elegida se mueve hacia donde mueves la mano.**

### Una capa

| Mano | Sello | Capa que controla | Cómo se mueve | Notación (expertos) |
|---|---|---|---|---|
| Derecha | ✊ Puño | Columna derecha | Mueves el puño arriba o abajo y la columna sube o baja | R / R' |
| Derecha | ☝️ Índice | Fila de arriba | Mueves la mano a un lado y la fila va hacia ese lado | U / U' |
| Derecha | ✋ Palma hacia la cámara | Cara de frente | Giras la mano como un volante y la cara gira igual | F / F' |
| Izquierda | ✊ Puño | Columna izquierda | Arriba o abajo | L / L' |
| Izquierda | ☝️ Índice | Fila de abajo | A un lado o al otro | D / D' |
| Izquierda | ✋ Palma hacia la cámara | Cara de atrás | Como un volante | B / B' |

Las dos manos usan los mismos tres sellos; la mano decide el lado: la derecha controla derecha, arriba y frente, y la izquierda controla izquierda, abajo y atrás. El índice vale apunte hacia donde apunte, para poder usar la postura más cómoda. (Al principio la izquierda usaba 👇 índice hacia abajo, pero obligaba a girar la muñeca y subir el hombro.)

Hacer el mismo movimiento dos veces seguidas equivale a media vuelta.

### El cubo entero

Si haces los sellos de las dos manos a la vez y las mueves juntas, se mueve el cubo entero. Por ejemplo, los dos puños hacia arriba inclinan el cubo, y los dos índices hacia un lado lo hacen girar. Así se ven las otras caras sin cursor.

### Sellos especiales

Hay que mantenerlos alrededor de 1 segundo para no activarlos por accidente.

- ✌️ Dos dedos hacia arriba: deshacer.
- Cruz con los dedos de ambas manos: mezclar el cubo. Hay que comprobar que la cámara lo reconoce bien, porque los dedos se cruzan.

### Reglas de funcionamiento

- **Zona activa ("zona de chakra"):** solo cuentan las manos que están dentro de una zona de la imagen. Al bajar las manos se descansa o se piensa sin que se active nada.
- **Sello estable:** la forma tiene que mantenerse un instante (unos 100 ms) antes de activarse.
- **Vista previa:** cuando se activa un sello, la capa elegida se ilumina antes de moverse. Si cambias de forma, se cancela.
- **Recarga:** después de cada movimiento la mano vuelve al centro para "recargar", y esa vuelta no cuenta como movimiento. Sin esto, cada movimiento dispararía el contrario al regresar la mano.
- **Ajustable:** los umbrales, y si hace falta los propios sellos, se afinan probando con personas reales.

## Aprender a armar el cubo: el camino del ninja

Una progresión por rangos. Un experto puede saltarla e ir directo al juego libre.

1. **Dojo de sellos.** El juego muestra un sello y una flecha, el jugador lo repite, y se mide su precisión y velocidad (como un curso de mecanografía). Aquí se forma la memoria muscular.
2. **Técnicas.** El método para principiantes usa pocas secuencias que se repiten (unas 4 o 5). Cada una es una "técnica" con nombre propio y efecto visual, y se entrena en el dojo.
3. **Lecciones guiadas.** El método para principiantes, etapa por etapa: cruz, primera capa, segunda capa, cruz de arriba, cara de arriba y colocación final. En cada lección el cubo viene preparado para practicar solo esa etapa, con las piezas importantes resaltadas.
4. **Resolver solo, con pistas.** En cualquier momento se puede pedir "¿qué hago ahora?". El juego dice en qué etapa estás y muestra con un cubo fantasma el siguiente movimiento.
5. **Velocidad.** Sin pistas, con cronómetro, récords y mezclas oficiales. Notación visible opcional.

Técnicamente, las pistas necesitan un "resolvedor" propio que siga las mismas etapas que enseñan las lecciones. Un resolvedor de soluciones óptimas no sirve para esto, porque sus soluciones son imposibles de seguir para una persona.

## Grabar y compartir

- **Cámara en pantalla:** la imagen de la webcam aparece en una esquina, en modo espejo, con los efectos de chakra dibujados sobre las manos.
- **Qué se graba:** todo se compone en una sola imagen (cubo, cámara, efectos, tiempo, nombres de técnicas) y se graba junto con los sonidos del juego.
- **Dos formatos:**
  - Horizontal 16:9, tipo stream: cubo grande y cámara en la esquina.
  - Vertical 9:16, para reels y TikTok: la cámara ocupa más espacio, porque las manos son el espectáculo.
- **Grabación automática:** cada resolución se graba sola desde que empieza hasta que el cubo queda armado. Al terminar aparece el tiempo y las opciones de descargar o compartir. También hay grabación manual.
- **Archivo:** MP4, que es lo que aceptan Instagram y TikTok.
- **Compartir:** en el móvil, el botón abre el menú de compartir del sistema (Instagram, TikTok, WhatsApp…) con el video adjunto. En PC se descarga el archivo; algunos navegadores de escritorio también permiten compartir. Ese menú del sistema requiere tocar o hacer clic.
- **Fuera del alcance inicial:** publicar directamente en Instagram o TikTok sin pasar por su app, porque requiere permisos especiales de cada plataforma.

## Qué hace que el video impresione

- **Respuesta instantánea:** la capa gira en cuanto la mano se mueve. Si hay retraso, parece falso.
- **Conexión visible entre mano y cubo:** al activarse un sello sale un destello de la mano en la cámara hacia la capa que se va a mover, del mismo color.
- **Símbolo y sonido** propios de cada sello.
- **Técnicas con nombre:** cuando el jugador encadena una secuencia conocida, aparece su nombre con un efecto especial, como un combo en un juego de peleas.
- **Final:** explosión de efectos, tiempo y número de movimientos.

## Tecnología

- Vite + TypeScript, sin framework.
- Three.js para el cubo en 3D.
- MediaPipe (`@mediapipe/tasks-vision`) para detectar las manos en el navegador.
- Web Audio para los sonidos.
- MediaRecorder, o WebCodecs + un muxer MP4, para grabar.
- Web Share API para compartir.
- Hosting estático con HTTPS (necesario para usar la cámara). No hace falta servidor en la primera versión.

## Hoja de ruta

1. ✅ Motor del cubo + 3D + modo fácil (teclado y táctil). Ya jugable, también en el móvil.
2. ✅ Detección de manos + reconocimiento de sellos + cámara en la esquina.
3. Modo ninja + dojo de sellos.
4. Grabar y compartir.
5. Aprender a armar: lecciones guiadas y pistas.
6. Modo medio.
7. Técnicas con nombre, efectos, rangos y modo velocidad.

## Riesgos y decisiones pendientes

- **Rendimiento:** detectar manos, dibujar el 3D, los efectos y grabar a la vez es exigente. En equipos modestos se grabará a 720p y 30 fps.
- **Nombres de Naruto:** si el juego se publica, conviene usar nombres propios inspirados en ese estilo y no marcas registradas (nombres de técnicas, símbolos de aldeas, etc.).
- **Pendiente de decidir:** el nombre del juego y los idiomas (español primero; ¿inglés?).
