# Cubo Rubik con gestos

Juego web de cubo Rubik en 3D que, al final, se jugará con gestos de las manos frente a la webcam. La visión completa y la hoja de ruta están en [docs/VISION.md](docs/VISION.md).

## Estado actual

**Fase 1: motor del cubo, cubo en 3D y modo fácil.**

- Arrastra sobre el cubo para girar una fila o columna; arrastra fuera para girar el cubo entero.
- Teclado: flechas para girar el cubo; `R L U D F B` (y `M E S`) para girar caras, con `Mayús` al revés; `Ctrl+Z` para deshacer.
- Mezclar, deshacer, reiniciar, cronómetro y aviso al resolver.

**Fase 2: cámara y reconocimiento de sellos.**

- El botón «Cámara» muestra la webcam en una esquina (en espejo) con el esqueleto de cada mano.
- Reconoce en cada mano: ✊ puño, ☝️ índice arriba, 👇 índice abajo, ✋ palma y ✌️ dos dedos.
- La franja de abajo es la zona de descanso: las manos ahí no cuentan.
- Los sellos todavía no mueven el cubo; eso llega con el modo ninja (fase 3).

La primera vez que se enciende la cámara, el navegador descarga el detector de manos de MediaPipe (unos 20 MB, luego queda en caché). El video se analiza en el propio navegador y no se envía a ningún sitio. La cámara solo funciona con `https` o desde `localhost`.

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
- `src/input/`: modos de control (teclado, arrastre con ratón o dedo). Aquí irán los gestos.
- `src/vision/`: cámara, detector de manos (MediaPipe) y reconocimiento de sellos. `hands-interpreter.ts` y `hand-shape.ts` no dependen de la cámara, así que se prueban con datos grabados (`__fixtures__/hands.json`).
- `src/ui/`: interfaz sobre el cubo y panel de la cámara.
- `scripts/generate-hand-fixtures.mjs`: regenera los datos de prueba de manos a partir de fotos de ejemplo de MediaPipe.
