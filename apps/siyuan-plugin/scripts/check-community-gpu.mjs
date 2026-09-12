// Interactive GPU regression, separate from workspace acquisition and shipping assets.
// Run with Node, then open its localhost URL in a WebGL2-capable browser.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const require = createRequire(import.meta.url);
const vendorRequire = createRequire(require.resolve("@cosmograph/cosmograph"));
const source = await readFile(vendorRequire.resolve("@cosmograph/cosmos"), "utf8");
const shaders = Object.fromEntries(["li", "di", "ci"].map((name) => {
  const match = source.match(new RegExp(`(?:const |, )${name} = \x60([^\x60]+)\x60`));
  if (!match) throw new Error(`Installed cluster shader ${name} was not found`);
  return [name, match[1]];
}));

function run(shaders) {
  const output = document.querySelector("pre");
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl || !gl.getExtension("EXT_color_buffer_float") || !gl.getExtension("EXT_float_blend")) {
    throw new Error("This probe requires WebGL2 float rendering and blending");
  }
  const nodes = 100000, groups = 117, width = Math.ceil(Math.sqrt(nodes)), clusterWidth = 11;
  const positions = new Float32Array(width * width * 4);
  const assignments = new Float32Array(positions.length).fill(-1);
  const exits = new Float32Array(positions.length);
  const indices = new Float32Array(nodes * 2);
  const sums = Array.from({ length: groups }, () => [0, 0, 0, 0]);
  const membership = new Uint32Array(nodes);
  for (let i = 0; i < nodes; i++) {
    const group = i < 60000 ? 0 : 1 + i % (groups - 1);
    membership[i] = group;
    const p = [1024 + group * 32 + i % 5 * 8, 2048 + group * 16 + i % 7 * 8, 512 + group * 24 + i % 3 * 8];
    positions.set([p[0], p[1], 0, p[2]], i * 4);
    assignments.set([group % clusterWidth, Math.floor(group / clusterWidth), 0, 0], i * 4);
    indices.set([i % width, Math.floor(i / width)], i * 2);
    p.forEach((v, axis) => sums[group][axis] += v);
    sums[group][3]++;
  }
  function texture(size, data) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, data);
    return t;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function uniforms(p, values, textures) {
    gl.useProgram(p);
    for (const [name, value] of Object.entries(values)) gl.uniform1f(gl.getUniformLocation(p, name), value);
    Object.entries(textures).forEach(([name, t], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(gl.getUniformLocation(p, name), unit);
    });
  }
  function target(t, size) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete float target");
    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  const positionTexture = texture(width, positions), clusterTexture = texture(width, assignments);
  const exitTexture = texture(width, exits), coefficient = texture(width, new Float32Array(positions.length).fill(1));
  const custom = texture(clusterWidth, new Float32Array(clusterWidth * clusterWidth * 4).fill(-1));
  const centermass = texture(clusterWidth, null), velocity = texture(width, null);
  const framebuffer = gl.createFramebuffer(), vao = gl.createVertexArray(), buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const quad = `#version 300 es
  precision highp float;
  out vec2 textureCoords;
  void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    textureCoords = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const results = [];
  for (const dimensions of [2, 3]) for (const variant of ["installed", "edge-sampling-control"]) {
    const change = (text, forceShader = false) => {
      // Deliberately restore the old sampling in the control. The fixture must
      // distinguish the installed fix from the actual regression on this GPU.
      if (forceShader && variant === "edge-sampling-control") text = text.replaceAll("(pointClusterIndices.xy + 0.5) / clustersTextureSize", "pointClusterIndices.xy / clustersTextureSize");
      return dimensions === 3 ? text.replace("#version 300 es", "#version 300 es\n#define SPACE_3D") : text;
    };
    const accumulate = program(change(shaders.di), shaders.li), force = program(quad, change(shaders.ci, true));
    target(centermass, clusterWidth);
    uniforms(accumulate, { pointsTextureSize: width, clustersTextureSize: clusterWidth }, { positionsTexture: positionTexture, clusterTexture, exitTexture });
    const location = gl.getAttribLocation(accumulate, "pointIndices");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, nodes);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(location);
    target(velocity, width);
    uniforms(force, { alpha: 0.3, clustersTextureSize: clusterWidth, clusterCoefficient: 0.3 }, {
      positionsTexture: positionTexture, clusterTexture, centermassTexture: centermass,
      clusterPositionsTexture: custom, clusterForceCoefficient: coefficient,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const values = new Float32Array(positions.length);
    gl.readPixels(0, 0, width, width, gl.RGBA, gl.FLOAT, values);
    let maxError = 0, invalid = 0;
    const net = [0, 0, 0];
    for (let i = 0; i < nodes; i++) for (let axis = 0; axis < dimensions; axis++) {
      const v = values[i * 4 + axis], sum = sums[membership[i]];
      const expected = (sum[axis] / sum[3] - positions[i * 4 + (axis === 2 ? 3 : axis)]) * 0.09;
      if (!Number.isFinite(v)) invalid++;
      else { maxError = Math.max(maxError, Math.abs(v - expected)); net[axis] += v; }
    }
    const error = gl.getError();
    results.push({ dimensions, variant, pass: !invalid && maxError < 0.02 && !error, maxError, invalid, meanForce: net.map(v => v / nodes), glError: error });
    gl.deleteProgram(accumulate);
    gl.deleteProgram(force);
  }
  output.textContent = JSON.stringify({ nodes, groups, results }, null, 2);
  output.dataset.result = results.every(r => r.variant === "installed" ? r.pass : !r.pass) ? "pass" : "fail";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

const html = `<!doctype html><meta charset="utf-8"><title>Native community GPU regression</title><h1>Native community GPU regression</h1><pre>Running…</pre><canvas hidden></canvas><script>try { (${run.toString()})(${JSON.stringify(shaders)}); } catch (error) { document.querySelector('pre').textContent = String(error.stack); }</script>`;
const server = createServer((request, response) => {
  if (request.url !== "/") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
});
server.listen(0, "127.0.0.1", () => console.log(`Community GPU regression: http://127.0.0.1:${server.address().port}/`));
