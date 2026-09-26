# Cubo Rubik con gestos

Juego web de cubo Rubik en 3D que, al final, se jugará con gestos de las manos frente a la webcam. La visión completa y la hoja de ruta están en [docs/VISION.md](docs/VISION.md).

## Estado actual

**Fase 1: motor del cubo, cubo en 3D y modo fácil.**

- Arrastra sobre el cubo para girar una fila o columna; arrastra fuera para girar el cubo entero.
- Teclado: flechas para girar el cubo; `R L U D F B` (y `M E S`) para girar caras, con `Mayús` al revés; `Ctrl+Z` para deshacer.
- Mezclar, deshacer, reiniciar, cronómetro y aviso al resolver.

**Fase 2: cámara y reconocimiento de sellos.**

- El botón «Cámara» muestra la webcam en una esquina (en espejo) con el esqueleto de cada mano.
- Reconoce en cada mano: ✊ puño, ☝️ índice (apuntando hacia donde sea más cómodo), ✋ palma y ✌️ dos dedos.
- La franja de abajo es la zona de descanso: las manos ahí no cuentan.

La primera vez que se enciende la cámara, el navegador descarga el detector de manos de MediaPipe (unos 20 MB, luego queda en caché). El video se analiza en el propio navegador y no se envía a ningún sitio. La cámara solo funciona con `https` o desde `localhost`.

**Fase 3: modo ninja y dojo.**

- El botón «Ninja» enciende la cámara y los sellos mueven el cubo: forma el sello, quédate quieto un instante y da un golpe; la capa va hacia donde mueves la mano. Luego vuelve al centro para recargar.
- Mano derecha: ✊ columna derecha (arriba/abajo), ☝️ fila de arriba (a los lados), ✋ cara de frente (girando como un volante). Mano izquierda: lo mismo con la columna izquierda, la fila de abajo y la cara de atrás.
- 🤘 (índice y meñique), con cualquier mano, mueve las capas del medio: arriba/abajo la columna, a los lados la fila, girando la capa entre frente y atrás.
- El mismo sello con las dos manos, a la vez, gira el cubo entero. ✌️ mantenido deshace; con las dos manos, mezcla.
- La capa armada se ilumina con el color de la mano, y cada movimiento aparece como una ficha de combo.
- El botón «Dojo» abre las lecciones: sellos, movimientos, capas del medio, girar el cubo y la técnica del remolino. Mide precisión y tiempo por paso, y guarda tu récord.

**Fase 4: grabar y compartir.**

- El botón «Grabar» abre las opciones: formato horizontal (1280×720, tipo stream) o vertical (720×1280, para reels) y grabación automática de cada resolución (activada por defecto: empieza al terminar la mezcla y acaba 2,5 s después de resolver, con una tarjeta final).
- El video se compone aparte: el cubo, la cámara con el esqueleto de las manos (en vertical ocupa la mitad de arriba), el cronómetro, las fichas de combo y la tarjeta de «¡Resuelto!».
- Se graba en MP4 (H.264) con MediaRecorder, directamente en el navegador (Chrome y Safari). Para no restar fluidez al juego, el cubo del video lo dibuja un segundo renderizador pequeño (copiar el lienzo de la pantalla es muy caro en Safari), se compone a 30 fps y cada fotograma se entrega al grabador justo al dibujarlo. Al terminar se puede ver, descargar o compartir con el menú del sistema (Web Share) donde el navegador lo permite.

**Fase 5 (en curso): aprender a armar el cubo.**

- «💡 Pista» abre el entrenador del método para principiantes (8 etapas): dice la etapa, el objetivo y el siguiente movimiento con su gesto ninja; ilumina la capa a mover (balanceándose hacia donde va el giro) y la pieza protagonista, y sigue tus movimientos.
- Pendiente: lecciones guiadas por etapa y las técnicas del método en el dojo.

El detector corre en un hilo aparte (`src/vision/detector.worker.ts`) para que el cubo siga a 60 fps con la cámara encendida. Si el navegador no lo permite, analiza en el hilo principal.

## Cómo ejecutarlo

Requiere Node 20 o superior.

```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # pruebas del motor del cubo y del reconocedor de sellos
npm run build    # versión para publicar, en dist/
```

Para probarlo en el móvil dentro de la misma red: `npm run dev -- --host` y abre la dirección que aparece en «Network». Ojo: así la cámara no funcionará en el móvil, porque el navegador exige `https` fuera de `localhost`.

## Estructura

- `src/core/`: lógica pura del cubo (estado, giros, notación, mezclas). Sin 3D.
- `src/game/`: reglas del juego: cola de animaciones, deshacer, cronómetro. Todos los modos de control envían las mismas órdenes (`commands.ts`).
- `src/render/`: el cubo en 3D con Three.js.
- `src/input/`: modos de control: teclado, arrastre con ratón o dedo, y `ninja/` (sellos → movimientos). `ninja/gesture-engine.ts` no depende de la cámara y se prueba con manos simuladas.
- `src/dojo/`: lecciones del dojo (pasos, aciertos, tiempos).
- `src/solver/`: resolvedor del método para principiantes (`beginner.ts`), paso a paso y con explicaciones. `search.ts` busca el camino más corto para cada arista de la cruz.
- `src/coach/`: el entrenador que sigue los movimientos del jugador y decide la siguiente pista.
- `src/recording/`: grabación de video: `compositor.ts` dibuja cada fotograma del video, `recording-controller.ts` decide cuándo grabar.
- `src/vision/`: cámara, detector de manos (MediaPipe) y reconocimiento de sellos. `hands-interpreter.ts` y `hand-shape.ts` no dependen de la cámara, así que se prueban con datos grabados (`__fixtures__/hands.json`).
- `src/ui/`: interfaz sobre el cubo y panel de la cámara.
- `scripts/generate-hand-fixtures.mjs`: regenera los datos de prueba de manos a partir de fotos de ejemplo de MediaPipe.
