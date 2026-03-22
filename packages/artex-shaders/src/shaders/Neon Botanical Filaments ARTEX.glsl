// Neon Botanical Filaments ARTEX.glsl
// Inspired by translucent wireframe floral references.
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uEffectStrength;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

float saturate(float x) { return clamp(x, 0.0, 1.0); }

float hash11(float p) {
  return fract(sin(p * 127.1 + 311.7) * 43758.5453123);
}

vec2 hash21(float p) {
  return fract(sin(vec2(p * 127.1 + 91.7, p * 311.7 + 17.3)) * 43758.5453123);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash11(dot(i, vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void addInk(inout vec3 color, vec3 ink, float alpha) {
  float a = saturate(alpha);
  color = mix(color, ink, a * 0.24);
  color += ink * a * 0.40;
}

vec4 renderFuzzyBloom(vec2 p, vec2 center, float radius, float seed, float time) {
  vec2 q = p - center;
  float rr = length(q);
  float ang = atan(q.y, q.x);
  float rNorm = rr / max(radius, 1e-4);

  float spikesCount = mix(28.0, 64.0, hash11(seed * 2.71));
  float spikes = pow(abs(sin(ang * spikesCount + time * 0.45 + seed * 9.0)), 26.0);
  float shell = exp(-pow((rr - radius) / (radius * 0.18 + 0.002), 2.0));
  float core = exp(-pow(rNorm, 2.3) * 1.6);
  float veil = exp(-pow((rr - radius * 0.66) / (radius * 0.35 + 0.001), 2.0));

  float alpha = core * 0.25 + shell * (0.15 + 0.85 * spikes) + veil * 0.08;
  alpha = saturate(alpha);

  vec3 colInner = vec3(0.93, 0.85, 1.0);
  vec3 colOuter = vec3(0.56, 0.60, 1.0);
  vec3 col = mix(colInner, colOuter, saturate(rNorm));

  float tipSpark = shell * pow(spikes, 1.4);
  col += vec3(1.0, 0.58, 0.58) * tipSpark * 0.35 * saturate(0.2 + 0.5 * uEffectParam3);

  return vec4(col, alpha);
}

vec4 renderWireBloom(vec2 p, vec2 center, float radius, float seed, float time) {
  vec2 q = p - center;
  q.y += 0.08 * radius * sin(time * 0.3 + seed * 2.0);

  float ax = radius * (0.55 + 0.35 * hash11(seed * 4.1));
  float ay = radius * (1.00 + 0.75 * hash11(seed * 5.7));
  vec2 e = q / vec2(max(ax, 0.001), max(ay, 0.001));
  float d = length(e);

  float body = smoothstep(1.04, 0.90, d);
  float vLines = pow(abs(sin(e.x * 40.0 + seed * 6.0 + time * 0.2)), 11.0);
  float hLines = pow(abs(sin(e.y * 34.0 - seed * 5.0 - time * 0.17)), 11.0);
  float mesh = mix(vLines, hLines, 0.42);
  float rim = exp(-pow((d - 1.0) / 0.06, 2.0));

  float alpha = body * (0.09 + 0.42 * mesh) + rim * (0.07 + 0.28 * vLines);
  vec3 col = mix(vec3(0.50, 0.61, 1.0), vec3(0.80, 0.74, 1.0), hash11(seed * 9.3));

  return vec4(col, saturate(alpha));
}

vec4 renderFanBloom(vec2 p, vec2 center, float radius, float seed, float time) {
  vec2 q = p - center;
  float rr = length(q) / max(radius, 1e-4);
  float ang = atan(q.y, q.x);

  float petalEdge = 0.92 + 0.14 * sin(6.0 * ang + seed + time * 0.22);
  float edge = 1.0 - smoothstep(petalEdge, petalEdge + 0.08, rr);
  float ribs = pow(abs(sin(ang * 30.0 + seed * 3.0 - time * 0.1)), 16.0);

  float alpha = edge * (0.16 + 0.46 * ribs);
  vec3 col = mix(vec3(0.63, 0.64, 0.99), vec3(0.96, 0.87, 1.0), pow(saturate(1.0 - rr), 1.4));

  return vec4(col, saturate(alpha));
}

vec4 renderCupBloom(vec2 p, vec2 center, float radius, float seed, float time) {
  vec2 q = p - center;
  q.y += radius * 0.45;
  float y = q.y / max(radius * 1.25, 1e-4);

  float halfW = mix(0.08, 0.52, saturate(y));
  float xNorm = abs(q.x / max(radius, 1e-4));
  float side = 1.0 - smoothstep(halfW - 0.02, halfW + 0.05, xNorm);

  float envelope = smoothstep(-0.2, 0.08, y) * (1.0 - smoothstep(1.18, 1.35, y));
  float phase = (q.x / max(radius * halfW, 0.002)) * 48.0 + y * 4.2 + seed * 7.0 + time * 0.15;
  float filaments = pow(abs(sin(phase)), 18.0);
  float tips = smoothstep(0.95, 1.12, y) * pow(abs(sin(q.x * 150.0 + seed * 21.0)), 20.0);

  float alpha = envelope * side * (0.22 + 0.63 * filaments) + side * tips * 0.36;
  vec3 col = mix(vec3(0.90, 0.29, 0.42), vec3(1.0, 0.63, 0.71), saturate(y * 0.7 + 0.25));

  return vec4(col, saturate(alpha));
}

vec4 renderGhostLeaf(vec2 p, vec2 center, vec2 size, float angle, float seed, float time) {
  vec2 q = p - center;
  float ca = cos(angle);
  float sa = sin(angle);
  q = mat2(ca, -sa, sa, ca) * q;

  vec2 e = q / max(size, vec2(0.001));
  float d = length(e);
  float body = smoothstep(1.04, 0.93, d);
  float mesh = pow(abs(sin(e.x * 18.0 + time * 0.12 + seed * 4.0) * sin(e.y * 26.0 - time * 0.16 + seed * 3.0)), 0.45);
  float rim = exp(-pow((d - 1.0) / 0.06, 2.0));

  float alpha = body * (0.04 + 0.14 * mesh) + rim * 0.04;
  vec3 col = mix(vec3(0.25, 0.34, 0.60), vec3(0.56, 0.70, 1.0), 0.55);

  return vec4(col, saturate(alpha));
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  float time = uTime * (0.45 + 0.75 * saturate(uEffectParam2 * 0.65));
  float density = 0.75 + 0.45 * saturate(uEffectParam1 * 0.5);
  float accent = saturate(uEffectParam3 * 0.5);
  float strength = saturate(uEffectStrength);

  vec3 bgA = vec3(0.003, 0.008, 0.045);
  vec3 bgB = vec3(0.008, 0.020, 0.090);
  vec3 baseColor = mix(bgA, bgB, 0.35 + 0.45 * smoothstep(-1.0, 0.9, p.y));
  baseColor += vec3(0.02, 0.03, 0.08) * noise21(uv * 6.0 + time * 0.2) * 0.12;

  vec3 color = baseColor;

  const int LEAF_COUNT = 20;
  for (int i = 0; i < LEAF_COUNT; i++) {
    float seed = float(i) + 300.0;
    float depth = hash11(seed * 3.3);
    float x = mix(-1.3, 1.3, hash11(seed * 2.31));
    float y = mix(-1.05, 0.25, hash11(seed * 1.97));
    vec2 center = vec2(x + 0.08 * sin(time * 0.2 + seed), y);
    vec2 size = vec2(
      mix(0.09, 0.32, hash11(seed * 4.2)),
      mix(0.05, 0.22, hash11(seed * 5.8))
    );
    float angle = mix(-1.3, 1.3, hash11(seed * 6.9));
    vec4 leaf = renderGhostLeaf(p, center, size, angle, seed, time);
    addInk(color, leaf.rgb * mix(0.65, 1.0, depth), leaf.a * (0.35 + 0.4 * depth));
  }

  const int FLOWER_COUNT = 32;
  for (int i = 0; i < FLOWER_COUNT; i++) {
    float seed = float(i) + 11.0;
    float depth = hash11(seed * 1.17);

    float x = mix(-1.25, 1.25, hash11(seed * 2.71));
    float rootY = -1.20 - 0.06 * hash11(seed * 3.09);
    float height = mix(0.45, 2.05, pow(depth, 0.55)) * density;
    float headY = rootY + height;

    float swayAmp = (0.025 + 0.13 * depth) * (0.45 + 0.9 * saturate(uEffectParam2 * 0.6));
    float sway = swayAmp * sin(time * (0.35 + 0.7 * hash11(seed * 4.51)) + seed * 4.0);
    vec2 head = vec2(
      x + sway,
      headY + 0.02 * sin(time * 0.9 + seed * 3.7)
    );

    float span = max(head.y - rootY, 0.01);
    float yN = saturate((p.y - rootY) / span);
    float stemCurve = sin(yN * 3.14159 + seed * 1.8) * sway * 0.55;
    float stemX = mix(x, head.x, yN) + stemCurve;
    float stemDist = abs(p.x - stemX);
    float stemW = mix(0.0018, 0.0075, depth) * (0.85 + 0.35 * density);
    float stemA = smoothstep(stemW * 2.8, stemW, stemDist);
    float stemWindow = smoothstep(rootY - 0.01, rootY + 0.06, p.y) * (1.0 - smoothstep(head.y + 0.03, head.y + 0.10, p.y));
    stemA *= stemWindow;

    vec3 stemCol = mix(vec3(0.23, 0.31, 0.58), vec3(0.58, 0.70, 1.0), 0.25 + 0.75 * depth);
    addInk(color, stemCol, stemA * (0.10 + 0.20 * depth));

    float r = mix(0.04, 0.20, hash11(seed * 8.11)) * mix(0.65, 1.32, depth) * (0.9 + 0.28 * density);
    float kind = hash11(seed * 9.91);

    vec4 bloom;
    if (kind < 0.25) {
      bloom = renderFuzzyBloom(p, head, r, seed, time);
    } else if (kind < 0.55) {
      bloom = renderWireBloom(p, head, r, seed, time);
    } else if (kind < 0.78) {
      bloom = renderFanBloom(p, head, r, seed, time);
    } else {
      bloom = renderCupBloom(p, head, r, seed, time);
    }

    float warm = step(0.78, hash11(seed * 12.6));
    bloom.rgb = mix(bloom.rgb, vec3(1.0, 0.58, 0.47), warm * (0.28 + 0.45 * accent));
    bloom.a *= (0.4 + 0.65 * depth);

    addInk(color, bloom.rgb, bloom.a * (0.45 + 0.2 * depth));

    if (hash11(seed * 13.37) > 0.68) {
      vec2 budOffset = (hash21(seed * 14.7) - 0.5) * vec2(r * 1.6, r * 1.2);
      vec2 budCenter = head + budOffset + vec2(0.0, r * 0.35);
      vec2 budQ = (p - budCenter) / vec2(max(r * 0.42, 0.001), max(r * 0.58, 0.001));
      float bud = 1.0 - smoothstep(0.86, 1.0, length(budQ));
      vec3 budCol = mix(vec3(0.75, 0.69, 1.0), vec3(1.0, 0.62, 0.53), hash11(seed * 15.5));
      addInk(color, budCol, bud * (0.12 + 0.2 * depth));
    }
  }

  float haze = exp(-3.5 * max(p.y + 0.95, 0.0));
  color += vec3(0.16, 0.20, 0.34) * haze * 0.08;

  color = 1.0 - exp(-color * (1.15 + 0.35 * accent));
  color = pow(color, vec3(0.95));

  vec3 finalColor = mix(baseColor, color, strength);
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
