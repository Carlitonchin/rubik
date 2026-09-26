# Cubo Rubik con gestos

Juego web de cubo Rubik en 3D que, al final, se jugará con gestos de las manos frente a la webcam. La visión completa y la hoja de ruta están en [docs/VISION.md](docs/VISION.md).

## Estado actual

Fase 1: motor del cubo, cubo en 3D y **modo fácil**.

- Arrastra sobre el cubo para girar una fila o columna; arrastra fuera para girar el cubo entero.
- Teclado: flechas para girar el cubo; `R L U D F B` (y `M E S`) para girar caras, con `Mayús` al revés; `Ctrl+Z` para deshacer.
- Mezclar, deshacer, reiniciar, cronómetro y aviso al resolver.

## Cómo ejecutarlo

Requiere Node 20 o superior.

```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # pruebas del motor del cubo
npm run build    # versión para publicar, en dist/
```

Para probarlo en el móvil dentro de la misma red: `npm run dev -- --host` y abre la dirección que aparece en «Network».

## Estructura

- `src/core/`: lógica pura del cubo (estado, giros, notación, mezclas). Sin 3D.
- `src/game/`: reglas del juego: cola de animaciones, deshacer, cronómetro. Todos los modos de control envían las mismas órdenes (`commands.ts`).
- `src/render/`: el cubo en 3D con Three.js.
- `src/input/`: modos de control (teclado, arrastre con ratón o dedo). Aquí irán los gestos.
- `src/ui/`: interfaz sobre el cubo.
