import './style.css';
import { Game } from './game/game';
import { attachPointerInput, DragController } from './input/drag';
import { attachKeyboardInput } from './input/keyboard';
import { CubeView } from './render/cube-view';
import { mountHud } from './ui/hud';

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
mountHud(app, game, dispatch);

// Acceso desde la consola del navegador para depurar.
if (import.meta.env.DEV) Object.assign(window, { game, view });
