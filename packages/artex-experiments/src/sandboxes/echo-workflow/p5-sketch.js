// Paste into the p5.js editor. No camera is requested until the button is clicked.
// Generated test scene + reusable circular history. p5.js 1.11.11.
const W = 320, H = 200, FPS = 24, CAPACITY = 241;
let source, buffer = [], head = 0, stored = 0, camera;
let count, depth, offset, blend, ui;

function setup() {
  pixelDensity(1);
  createCanvas(640, 400);
  frameRate(FPS);
  source = createGraphics(W, H);
  source.pixelDensity(1);
  ui = createDiv();
  count = control('Taps', 1, 12, 4);
  depth = control('Depth in frames', 4, 192, 24);
  offset = control('Offset in frames', 0, 48, 0);
  blend = control('Blend percent', 0, 100, 68);
  createButton('Use camera').parent(ui).mousePressed(() => {
    if (camera) return;
    camera = createCapture(VIDEO);
    camera.size(W, H);
    camera.hide();
  });
  createButton('Animated scene').parent(ui).mousePressed(() => {
    if (!camera) return;
    const stream = camera.elt.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    camera.remove();
    camera = null;
  });
  createButton('Clear history').parent(ui).mousePressed(() => {
    buffer.forEach(g => g.remove());
    buffer = []; head = 0; stored = 0;
  });
}

function control(label, min, max, value) {
  const row = createDiv(label + ' '); row.parent(ui);
  const slider = createSlider(min, max, value, 1); slider.parent(row);
  return slider;
}

function draw() {
  source.background(7, 10, 12);
  if (camera && camera.elt.readyState >= 2) {
    source.image(camera, 0, 0, W, H);
  } else {
    const t = frameCount / FPS;
    source.noFill(); source.stroke(28, 39, 36);
    for (let x = 0; x < W; x += 20) source.line(x, 0, x, H);
    for (let y = 0; y < H; y += 20) source.line(0, y, W, y);
    source.strokeWeight(3); source.stroke(205, 255, 123);
    source.circle(W/2 + sin(t*1.3)*W*.29, H/2 + cos(t)*H*.22, 64);
    source.noStroke(); source.fill(240, 131, 167);
    source.circle(W/2 + cos(t*1.7)*W*.23, H/2 + sin(t*1.6)*H*.28, 32);
  }
  // Overwrite the same slot after wrapping, rather than growing forever.
  if (!buffer[head]) {
    buffer[head] = createGraphics(W, H);
    buffer[head].pixelDensity(1);
  }
  buffer[head].image(source, 0, 0);
  head = (head + 1) % CAPACITY;
  stored = min(stored + 1, CAPACITY);

  const n = count.value(), mix = blend.value()/100;
  const ctx = drawingContext;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - mix;
  ctx.drawImage(source.canvas, 0, 0, width, height);
  for (let i = 1; i <= n; i++) {
    const delay = offset.value() + round(i * depth.value() / n);
    const age = min(delay, stored - 1);
    const index = (head - 1 - age + CAPACITY) % CAPACITY;
    ctx.globalAlpha = mix / n;
    ctx.drawImage(buffer[index].canvas, 0, 0, width, height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
