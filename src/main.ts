import './style.css';
import { Game } from './game/game';
import { attachPointerInput, DragController } from './input/drag';
import { attachKeyboardInput } from './input/keyboard';
import { CubeView } from './render/cube-view';
import { NinjaController } from './input/ninja/ninja-controller';
import { RecordingController } from './recording/recording-controller';
import { mountCameraPanel } from './ui/camera-panel';
import { mountDojo } from './ui/dojo-panel';
import { mountHud } from './ui/hud';
import { mountMoveFeed } from './ui/move-feed';
import { mountRecordingPanel } from './ui/recording-panel';
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

// Modo ninja: la cámara detecta las manos y los sellos mueven el cubo (botón «Ninja»).
const tracker = new HandTracker();
const ninja = new NinjaController(game, view, tracker);
mountCameraPanel(app, tracker, ninja);
mountMoveFeed(app, ninja);
const dojo = mountDojo(app, { tracker, ninja, game, view });

// Grabar la partida en video (automático en cada resolución o a mano).
const recording = new RecordingController(game, view, tracker, ninja);

const hud = mountHud(app, game, dispatch, {
  onToggleCamera: () => (tracker.isActive ? tracker.stop() : void tracker.start()),
  onOpenDojo: () => dojo.open(),
  onRecord: () => recordingPanel.toggle(),
});
tracker.onStatus((status) => hud.setCameraActive(status.state === 'starting' || status.state === 'running'));
const recordingPanel = mountRecordingPanel(app, recording, {
  onRecordingChange: (active) => hud.setRecording(active),
  onResultShown: () => hud.hideSolved(),
});

// Acceso desde la consola del navegador para depurar.
if (import.meta.env.DEV) Object.assign(window, { game, view, tracker, ninja, recording });
