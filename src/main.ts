import './style.css';
import { Game } from './game/game';
import { attachPointerInput, DragController } from './input/drag';
import { attachKeyboardInput } from './input/keyboard';
import { CubeView } from './render/cube-view';
import { mountCameraPanel } from './ui/camera-panel';
import { mountHud } from './ui/hud';
import { HandTracker } from './vision/hand-tracker';

const app = document.querySelector<HTMLElement>('#app')!;
const stage = document.createElement('div');
stage.className = 'stage';
app.appendChild(stage);

const view = new CubeView(stage);
const game = new Game(view);
const dispatch = game.dispatch.bind(game);

// Modo fácil: teclado, ratón y pantalla táctil.
attachPointerInput(view.canvas, new DragController(game, view));
attachKeyboardInput(window, dispatch);

// Cámara y detección de manos (se activan con el botón «Cámara»).
const tracker = new HandTracker();
mountCameraPanel(app, tracker);
const hud = mountHud(app, game, dispatch, {
  onToggleCamera: () => (tracker.isActive ? tracker.stop() : void tracker.start()),
});
tracker.onStatus((status) => hud.setCameraActive(status.state === 'starting' || status.state === 'running'));

// Acceso desde la consola del navegador para depurar.
if (import.meta.env.DEV) Object.assign(window, { game, view, tracker });
